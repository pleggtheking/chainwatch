/**
 * WebSocket server — live event feed for the dashboard.
 *
 * On connection, authenticates the client via query param ?key=cw_...
 * Subscribes to the workspace's Redis channel and forwards messages.
 */

import type { FastifyInstance } from 'fastify';
import { redisSub } from './redis.js';
import { getWorkspaceById } from '../db/queries.js';
import * as bcrypt from 'bcrypt';

export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    // Authenticate via query param (WebSocket can't use Authorization header easily).
    const key = (req.query as { key?: string }).key;
    if (!key || !key.startsWith('cw_')) {
      socket.send(JSON.stringify({ error: 'Authentication required' }));
      socket.close(4001);
      return;
    }

    const parts = key.split('_');
    if (parts.length < 3) {
      socket.send(JSON.stringify({ error: 'Invalid key format' }));
      socket.close(4001);
      return;
    }

    const workspaceId = parts[1]!;
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      socket.send(JSON.stringify({ error: 'Workspace not found' }));
      socket.close(4001);
      return;
    }

    // Verify the API key.
    const { sql } = await import('../db/index.js');
    const keys = await sql`SELECT * FROM api_keys WHERE workspace_id = ${workspaceId}`;
    let authenticated = false;
    for (const keyRow of keys) {
      if (await bcrypt.compare(key, keyRow.key_hash as string)) {
        authenticated = true;
        break;
      }
    }

    if (!authenticated) {
      socket.send(JSON.stringify({ error: 'Invalid API key' }));
      socket.close(4001);
      return;
    }

    // Subscribe to the workspace channel.
    const channel = `chainwatch:workspace:${workspaceId}`;
    await redisSub.subscribe(channel);

    const messageHandler = (_channel: string, message: string): void => {
      if (_channel === channel) {
        socket.send(message);
      }
    };

    redisSub.on('message', messageHandler);

    socket.on('close', () => {
      redisSub.off('message', messageHandler);
      redisSub.unsubscribe(channel).catch(() => {});
    });

    socket.send(JSON.stringify({ event: 'connected', workspace: workspace.name }));
  });
}
