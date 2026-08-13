/**
 * POST /api/v1/events — ingest findings from CLI/Action.
 *
 * Request body:
 *   { repo: string, run_id: string, findings: Finding[] }
 *
 * Response:
 *   { ingested: number, repo_id: string }
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getOrCreateRepo, insertFinding } from '../db/queries.js';
import { publishFinding } from '../realtime/redis.js';
import { hasFeature } from './auth.js';

const FindingSchema = z.object({
  rule: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  package: z.string(),
  description: z.string(),
  file: z.string().optional(),
  evidence: z.string().optional(),
  chain_score: z.number().optional(),
});

const EventsRequestSchema = z.object({
  repo: z.string().min(1),
  run_id: z.string().min(1),
  findings: z.array(FindingSchema),
});

/** Rule name → CWxxx signal ID mapping (matches the SARIF reporter). */
const RULE_TO_SIGNAL: Record<string, string> = {
  postinstall_network: 'CW001',
  postinstall_shell: 'CW002',
  credential_file_access: 'CW003',
  obfuscation_score: 'CW004',
  suspicious_publish: 'CW005',
  dependency_confusion: 'CW006',
  behavioral_drift: 'CW007',
};

function getSignalId(rule: string): string {
  return RULE_TO_SIGNAL[rule] ?? rule;
}

export async function registerEventsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/events', {
    preHandler: async (req, reply) => {
      // Freemium gate: cloud sync requires team tier or above.
      if (!req.workspace || !hasFeature(req.workspace, 'cloud_sync')) {
        await reply.code(403).send({
          error: 'Cloud sync requires a Team plan. Upgrade at https://chainwatch.dev/upgrade',
        });
        return;
      }
    },
  }, async (req, reply) => {
    const parseResult = EventsRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      await reply.code(400).send({ error: 'Invalid request body', details: parseResult.error.issues });
      return;
    }

    const { repo: repoName, run_id: runId, findings } = parseResult.data;
    const workspace = req.workspace!;

    // Get or create the repo.
    const repo = await getOrCreateRepo(workspace.id, repoName);

    // Insert all findings.
    const inserted = [];
    for (const f of findings) {
      const row = await insertFinding(repo.id, runId, {
        severity: f.severity,
        signal: getSignalId(f.rule),
        package: f.package,
        description: f.description,
        file: f.file,
        evidence: f.evidence,
        chain_score: f.chain_score,
      });
      inserted.push(row);
    }

    // Publish to Redis for real-time dashboard feed.
    for (const row of inserted) {
      await publishFinding(workspace.id, { ...row, repo_name: repoName });
    }

    // Check for alerts (fire and forget — don't block the response).
    const { checkAlerts } = await import('./alerts.js');
    checkAlerts(workspace.id, inserted).catch(() => {});

    await reply.send({ ingested: inserted.length, repo_id: repo.id });
  });
}
