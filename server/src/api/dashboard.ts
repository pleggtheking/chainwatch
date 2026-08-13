/**
 * GET /api/v1/dashboard/overview — dashboard data for the workspace.
 * GET /api/v1/dashboard/repos — list all repos with latest finding counts.
 * GET /api/v1/dashboard/repos/:id — single repo detail with findings.
 */

import type { FastifyInstance } from 'fastify';
import {
  getRecentFindings,
  getFindingTrend,
  getFindingStats,
  listRepos,
  getFindingsByRepo,
} from '../db/queries.js';
import { hasFeature } from './auth.js';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  // Overview — summary stats + recent findings + trend
  app.get('/api/v1/dashboard/overview', {
    preHandler: async (req, reply) => {
      if (!req.workspace || !hasFeature(req.workspace, 'dashboard')) {
        await reply.code(403).send({ error: 'Dashboard requires a Team plan.' });
        return;
      }
    },
  }, async (req, reply) => {
    const workspace = req.workspace!;

    const [stats, recentFindings, trend] = await Promise.all([
      getFindingStats(workspace.id),
      getRecentFindings(workspace.id, 20),
      getFindingTrend(workspace.id, 30),
    ]);

    await reply.send({
      workspace: { name: workspace.name, tier: workspace.tier },
      stats,
      recent_findings: recentFindings,
      trend,
    });
  });

  // List repos
  app.get('/api/v1/dashboard/repos', {
    preHandler: async (req, reply) => {
      if (!req.workspace || !hasFeature(req.workspace, 'dashboard')) {
        await reply.code(403).send({ error: 'Dashboard requires a Team plan.' });
        return;
      }
    },
  }, async (req, reply) => {
    const workspace = req.workspace!;
    const repos = await listRepos(workspace.id);
    await reply.send({ repos });
  });

  // Repo detail
  app.get('/api/v1/dashboard/repos/:id', {
    preHandler: async (req, reply) => {
      if (!req.workspace || !hasFeature(req.workspace, 'dashboard')) {
        await reply.code(403).send({ error: 'Dashboard requires a Team plan.' });
        return;
      }
    },
  }, async (req, reply) => {
    const { id: repoId } = req.params as { id: string };
    const workspace = req.workspace!;

    // Verify the repo belongs to this workspace.
    const { sql } = await import('../db/index.js');
    const repoRows = await sql`SELECT * FROM repos WHERE id = ${repoId} AND workspace_id = ${workspace.id}`;
    if (repoRows.length === 0) {
      await reply.code(404).send({ error: 'Repo not found' });
      return;
    }

    const findings = await getFindingsByRepo(repoId, 100);

    // Per-signal breakdown.
    const signalBreakdown = new Map<string, number>();
    for (const f of findings) {
      signalBreakdown.set(f.signal, (signalBreakdown.get(f.signal) ?? 0) + 1);
    }

    await reply.send({
      repo: repoRows[0],
      findings,
      signal_breakdown: [...signalBreakdown.entries()].map(([signal, count]) => ({ signal, count })),
    });
  });
}
