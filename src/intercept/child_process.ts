/**
 * child_process interceptor — detects shell spawns and self-propagation.
 *
 * Wraps exec/execSync/spawn/spawnSync/fork. Any shell spawn fires `shell_spawn`.
 * If the command includes `npm publish`, `npm whoami`, or token enumeration,
 * it escalates to `self_propagation` (the worm tell). Throws on block.
 */

import { createRequire } from 'node:module';
import { ChainWatchBlockError, type Engine } from '../engine.js';

const require = createRequire(import.meta.url);
const cp = require('node:child_process');

type AnyFn = (...args: any[]) => any;

const originals: Record<string, AnyFn> = {};

const PROPAGATION_RE = /\b(?:npm\s+publish|npm\s+whoami|npm\s+token|npm\s+access|yarn\s+publish|pnpm\s+publish)\b/;

function wrap(name: string, engine: Engine): void {
  const original = cp[name] as AnyFn;
  originals[name] = original;
  cp[name] = function patched(...args: any[]): any {
    const cmd = String(args[0] ?? '');
    const isPropagation = PROPAGATION_RE.test(cmd);
    const { action, event } = engine.evaluate(
      isPropagation ? 'self_propagation' : 'shell_spawn',
      isPropagation ? 'critical' : 'medium',
      isPropagation ? engine.policy.baseScore.self_propagation : engine.policy.baseScore.shell_spawn,
      { command: cmd },
    );
    if (action === 'block') throw new ChainWatchBlockError(event);
    return original.apply(this, args);
  };
}

export function installChildProcess(engine: Engine): void {
  wrap('exec', engine);
  wrap('execSync', engine);
  wrap('spawn', engine);
  wrap('spawnSync', engine);
  wrap('fork', engine);
}

export function uninstallChildProcess(): void {
  for (const [name, fn] of Object.entries(originals)) {
    cp[name] = fn;
    delete originals[name];
  }
}
