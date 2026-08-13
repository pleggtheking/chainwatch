/**
 * Network interceptor — detects outbound connections to non-allowlisted hosts.
 *
 * Wraps `net.connect`, `http.request`, `https.request`, `dns.lookup`, etc.
 * Any outbound to a host NOT in the policy allowlist fires `network_exfil`.
 * The chain scorer turns this critical when it follows a credential read.
 * Throws on block.
 */

import { createRequire } from 'node:module';
import { ChainWatchBlockError, type Engine } from '../engine.js';

const require = createRequire(import.meta.url);
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');

type AnyFn = (...args: any[]) => any;

const originals: Record<string, AnyFn> = {};

/** Extract the target host from the various argument shapes Node accepts. */
function extractHost(args: any[]): string {
  const a = args[0];
  if (!a) return '';
  if (typeof a === 'string') {
    try {
      return new URL(a).hostname || a;
    } catch {
      return a;
    }
  }
  if (a instanceof URL) return a.hostname;
  if (typeof a === 'object') {
    return a.hostname || a.host || '';
  }
  if (typeof a === 'number' && typeof args[1] === 'string') return args[1];
  return '';
}

function isAllowlisted(host: string, engine: Engine): boolean {
  if (!host) return true;
  return engine.policy.networkAllowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function checkHost(host: string, engine: Engine): void {
  if (isAllowlisted(host, engine)) return;
  const { action, event } = engine.evaluate(
    'network_exfil',
    'medium',
    engine.policy.baseScore.network_exfil,
    { host },
  );
  if (action === 'block') throw new ChainWatchBlockError(event);
}

function wrap(mod: any, modName: string, name: string, engine: Engine): void {
  const original = mod[name] as AnyFn;
  originals[`${modName}.${name}`] = original;
  mod[name] = function patched(...args: any[]): any {
    const host = extractHost(args);
    checkHost(host, engine);
    return original.apply(this, args);
  };
}

export function installNet(engine: Engine): void {
  wrap(net, 'net', 'connect', engine);
  wrap(net, 'net', 'createConnection', engine);
  wrap(http, 'http', 'request', engine);
  wrap(http, 'http', 'get', engine);
  wrap(https, 'https', 'request', engine);
  wrap(https, 'https', 'get', engine);
  wrap(dns, 'dns', 'lookup', engine);
  wrap(dns, 'dns', 'resolve', engine);
  wrap(dns, 'dns', 'resolve4', engine);
  wrap(dns, 'dns', 'resolve6', engine);
}

export function uninstallNet(): void {
  for (const [key, fn] of Object.entries(originals)) {
    const [modName, fnName] = key.split('.');
    if (!fnName) continue;
    const mod = modName === 'net' ? net : modName === 'http' ? http : modName === 'https' ? https : dns;
    mod[fnName] = fn;
    delete originals[key];
  }
}
