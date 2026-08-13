/**
 * ChainWatch Cloud API server.
 *
 * Fastify app with:
 *   - API key auth middleware
 *   - POST /api/v1/events — ingest findings
 *   - POST/GET /api/v1/baselines — upload/download team baselines
 *   - GET /api/v1/dashboard/* — dashboard data endpoints
 *   - POST /api/v1/alerts/test — test alert config
 *   - GET /ws — WebSocket for live event feed
 *   - POST /api/v1/workspaces — create workspace + get API key (bootstrap)
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { authMiddleware, generateApiKey } from './api/auth.js';
import { registerEventsRoutes } from './api/events.js';
import { registerBaselinesRoutes } from './api/baselines.js';
import { registerDashboardRoutes } from './api/dashboard.js';
import { registerWebSocketRoutes } from './realtime/ws.js';
import { createWorkspace, listAlertConfigs, createAlertConfig } from './db/queries.js';
import { testAlert } from './api/alerts.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: true });

  // Register plugins.
  await app.register(websocket);
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max baseline file
  });

  // ─── Public routes (no auth) ──────────────────────────────────────────────

  // Health check.
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Bootstrap: create a workspace and get an API key.
  // This is the only unauthenticated endpoint. In production, this would be
  // behind a signup flow with email verification.
  app.post('/api/v1/workspaces', async (req, reply) => {
    const { name, slug, tier } = req.body as { name: string; slug: string; tier?: string };
    if (!name || !slug) {
      await reply.code(400).send({ error: 'name and slug are required' });
      return;
    }
    const ws = await createWorkspace(name, slug, (tier as 'free' | 'team' | 'enterprise') ?? 'free');
    const apiKey = await generateApiKey(ws.id, 'initial');
    await reply.code(201).send({ workspace: ws, api_key: apiKey });
  });

  // ─── Authenticated routes ─────────────────────────────────────────────────

  // Apply auth middleware to all /api/v1/* routes except workspace creation.
  app.addHook('preHandler', async (req, reply) => {
    // Skip auth for health check and workspace creation.
    if (req.url === '/health' || req.url === '/api/v1/workspaces') return;
    if (req.url.startsWith('/ws')) return; // WS handles its own auth
    await authMiddleware(req, reply);
  });

  // Register route handlers.
  await registerEventsRoutes(app);
  await registerBaselinesRoutes(app);
  await registerDashboardRoutes(app);
  await registerWebSocketRoutes(app);

  // Alert management.
  app.get('/api/v1/alerts', async (req, reply) => {
    const workspace = req.workspace!;
    const alerts = await listAlertConfigs(workspace.id);
    await reply.send({ alerts });
  });

  app.post('/api/v1/alerts', async (req, reply) => {
    const workspace = req.workspace!;
    const { type, config, min_severity } = req.body as { type: string; config: object; min_severity?: string };
    if (!type || !config) {
      await reply.code(400).send({ error: 'type and config are required' });
      return;
    }
    const alert = await createAlertConfig(workspace.id, type as 'slack' | 'webhook', config as any, min_severity ?? 'high');
    await reply.code(201).send({ alert });
  });

  app.post('/api/v1/alerts/test', async (req, reply) => {
    const workspace = req.workspace!;
    const { type, config } = req.body as { type: string; config: object };
    const result = await testAlert({
      id: 'test',
      workspace_id: workspace.id,
      type: type as 'slack' | 'webhook',
      config: config as any,
      min_severity: 'critical',
      enabled: true,
      created_at: new Date(),
    });
    await reply.send(result);
  });

  // API key management.
  app.post('/api/v1/api-keys', async (req, reply) => {
    const workspace = req.workspace!;
    const { label } = req.body as { label: string };
    const apiKey = await generateApiKey(workspace.id, label ?? 'unnamed');
    await reply.code(201).send({ api_key: apiKey });
  });

  app.get('/api/v1/api-keys', async (req, reply) => {
    const workspace = req.workspace!;
    const { listApiKeys } = await import('./db/queries.js');
    const keys = await listApiKeys(workspace.id);
    await reply.send({ keys });
  });

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`ChainWatch Cloud API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Run if called directly (not imported).
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  start();
}

export { buildServer };
