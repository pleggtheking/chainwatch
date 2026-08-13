/**
 * fs interceptor — detects credential-file access.
 *
 * Wraps the read-path functions on the CJS `fs` module. When a package reads a
 * file matching a credential pattern (`.npmrc`, `.ssh/`, `.env`, `.aws/`, etc.),
 * fires a `credential_access` signal. Throws ChainWatchBlockError if the engine
 * decides to block (high chain score).
 */

import { createRequire } from 'node:module';
import { ChainWatchBlockError, type Engine } from '../engine.js';

const require = createRequire(import.meta.url);
const fs = require('node:fs');

type AnyFn = (...args: any[]) => any;

const originals: Record<string, AnyFn> = {};

function wrapRead(name: string, engine: Engine): void {
  const original = fs[name] as AnyFn;
  originals[name] = original;
  fs[name] = function patched(...args: any[]): any {
    const path = String(args[0] ?? '');
    checkCredential(path, engine);
    return original.apply(this, args);
  };
}

function checkCredential(path: string, engine: Engine): void {
  for (const re of engine.policy.credentialPatterns) {
    if (re.test(path)) {
      const { action, event } = engine.evaluate(
        'credential_access',
        'high',
        engine.policy.baseScore.credential_access,
        { file: path, pattern: re.source },
      );
      if (action === 'block') throw new ChainWatchBlockError(event);
      return;
    }
  }
}

export function installFs(engine: Engine): void {
  wrapRead('readFileSync', engine);
  wrapRead('readFile', engine);
  wrapRead('openSync', engine);
  wrapRead('open', engine);
  wrapRead('createReadStream', engine);
}

export function uninstallFs(): void {
  for (const [name, fn] of Object.entries(originals)) {
    fs[name] = fn;
    delete originals[name];
  }
}
