/**
 * ChainWatch — npm supply-chain runtime watchdog.
 *
 * import { start } from 'chainwatch';
 * const engine = start();   // installs interceptors, begins watching
 * // ... run untrusted code ...
 * engine.uninstall();
 */

import { Engine } from './engine.js';
import './intercept/index.js'; // side-effect: registers installers with Engine

export { Engine, ChainWatchBlockError } from './engine.js';
export type { EventListener } from './engine.js';
export { ChainScorer } from './scorer.js';
export { DEFAULT_POLICY } from './policy.js';
export type { Policy } from './policy.js';
export type { ChainWatchEvent, SignalType, Severity, Action } from './events.js';
export { formatEvent, printEventTrail } from './reporter/index.js';

/**
 * Start ChainWatch. Installs all interceptors and begins monitoring.
 * Returns the engine — use `engine.events` to read the event log, or
 * `engine.onEvent(cb)` for real-time callbacks.
 */
export function start(policy?: import('./policy.js').Policy): Engine {
  const engine = new Engine(policy);
  engine.install();
  return engine;
}
