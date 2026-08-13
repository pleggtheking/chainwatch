/**
 * ChainWatch preload — loaded via `node --import chainwatch/preload` to start
 * the runtime interceptor before the user's code runs.
 *
 * Events are written to a JSONL file (path from CHAINWATCH_EVENT_LOG env var)
 * so the parent `chainwatch watch` process can display them in real time.
 */

import * as fs from 'node:fs';
import { start, type ChainWatchEvent } from './index.js';

const eventLogPath = process.env['CHAINWATCH_EVENT_LOG'];

const engine = start();

if (eventLogPath) {
  engine.onEvent((e: ChainWatchEvent) => {
    try {
      fs.appendFileSync(eventLogPath, JSON.stringify(e) + '\n');
    } catch {
      // Best effort — don't crash the watched process.
    }
  });
}

// Export for programmatic use.
export { engine };
