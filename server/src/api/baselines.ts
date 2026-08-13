/**
 * POST /api/v1/baselines — upload a baseline JSONL for team sharing.
 * GET  /api/v1/baselines/:repo — download the latest baseline.
 */

import type { FastifyInstance } from 'fastify';
import * as zlib from 'node:zlib';
import { getOrCreateRepo, uploadBaseline, getBaseline } from '../db/queries.js';
import { hasFeature } from './auth.js';

export async function registerBaselinesRoutes(app: FastifyInstance): Promise<void> {
  // Upload baseline (multipart form data)
  app.post('/api/v1/baselines', {
    preHandler: async (req, reply) => {
      if (!req.workspace || !hasFeature(req.workspace, 'team_baseline')) {
        await reply.code(403).send({
          error: 'Team baseline sharing requires a Team plan.',
        });
        return;
      }
    },
  }, async (req, reply) => {
    const data = await req.file();
    if (!data) {
      await reply.code(400).send({ error: 'Missing file upload' });
      return;
    }

    const repoField = data.fields['repo'] as any;
    const lockfileField = data.fields['lockfile_hash'] as any;
    const repoName = (Array.isArray(repoField) ? repoField[0] : repoField)?.value as string;
    const lockfileHash = (Array.isArray(lockfileField) ? lockfileField[0] : lockfileField)?.value as string;
    if (!repoName || !lockfileHash) {
      await reply.code(400).send({ error: 'Missing repo or lockfile_hash fields' });
      return;
    }

    const workspace = req.workspace!;
    const repo = await getOrCreateRepo(workspace.id, repoName);

    // Read the file buffer.
    const buffer = await data.toBuffer();

    // Compress with gzip if not already compressed.
    let compressed: Buffer;
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      compressed = buffer; // Already gzip
    } else {
      compressed = zlib.gzipSync(buffer);
    }

    const row = await uploadBaseline(repo.id, lockfileHash, compressed);

    await reply.send({ baseline_id: row.id, stored_bytes: compressed.length });
  });

  // Download baseline
  app.get('/api/v1/baselines/:repo', {
    preHandler: async (req, reply) => {
      if (!req.workspace || !hasFeature(req.workspace, 'team_baseline')) {
        await reply.code(403).send({
          error: 'Team baseline sharing requires a Team plan.',
        });
        return;
      }
    },
  }, async (req, reply) => {
    const { repo: repoName } = req.params as { repo: string };
    const lockfileHash = (req.query as { lockfile_hash?: string }).lockfile_hash;

    if (!lockfileHash) {
      await reply.code(400).send({ error: 'Missing lockfile_hash query parameter' });
      return;
    }

    const workspace = req.workspace!;
    const { sql } = await import('../db/index.js');
    const repoRows = await sql`SELECT * FROM repos WHERE workspace_id = ${workspace.id} AND name = ${decodeURIComponent(repoName)}`;
    if (repoRows.length === 0) {
      await reply.code(404).send({ error: 'Repo not found' });
      return;
    }

    const baseline = await getBaseline(repoRows[0]!.id as string, lockfileHash);
    if (!baseline) {
      await reply.code(404).send({ error: 'Baseline not found for this lockfile hash' });
      return;
    }

    // Send gzip-compressed JSONL.
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Encoding', 'gzip');
    await reply.send(baseline.content);
  });
}
