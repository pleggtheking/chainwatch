/**
 * ChainWatch live demo — catches a simulated Shai-Hulud worm in real time.
 *
 * This is the Phase 1 milestone: a fake malicious package runs the real attack
 * chain (read creds → enumerate tokens → exfiltrate), and ChainWatch catches
 * and blocks it with a full event trail.
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { start, printEventTrail, ChainWatchBlockError } from './index.js';

export async function runDemo(): Promise<void> {
  const BANNER = '\n  ╔══════════════════════════════════════════════════════════════╗\n  ║          ChainWatch — Live Worm Catch Demo                     ║\n  ╚══════════════════════════════════════════════════════════════╝';

  console.log(BANNER);
  console.log('\n  Simulating the Shai-Hulud npm worm attack chain:\n');
  console.log('    1. Read ~/.npmrc          → steal npm auth token');
  console.log('    2. Run `npm whoami`       → verify/enumerate stolen token');
  console.log('    3. POST token to C2 host  → exfiltrate to attacker\n');
  console.log('  ChainWatch is watching. Let\'s see if it catches the worm...\n');
  console.log('  ' + '─'.repeat(64));

  // --- Sandbox setup: create a fake .npmrc so the worm has something to steal ---
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'chainwatch-demo-'));
  const fakeNpmrc = path.join(sandbox, '.npmrc');
  fs.writeFileSync(
    fakeNpmrc,
    '//registry.npmjs.org/:_authToken=npm_DEADBEEF_fake_token_for_demo_only\n',
  );
  // Point os.homedir() at the sandbox so the worm reads our fake .npmrc.
  process.env.HOME = sandbox;
  process.env.USERPROFILE = sandbox;

  // --- Start ChainWatch ---
  const engine = start();
  engine.onEvent((e) => {
    const icon = e.action === 'block' ? '🛑' : e.action === 'flag' ? '⚠️ ' : '  ';
    console.log(`  ${icon} [CW] ${e.action.toUpperCase().padEnd(5)} ${e.severity.padEnd(8)} ${e.signal.padEnd(20)} pkg="${e.package}"`);
  });

  // --- Load and run the fake worm ---
  const require = createRequire(import.meta.url);
  let blocked = false;
  let blockMessage = '';

  try {
    const worm = require('fake-worm');
    console.log('\n  ▶ fake-worm loaded. Calling infect()...\n');
    await worm.infect();
  } catch (e) {
    if (e instanceof ChainWatchBlockError) {
      blocked = true;
      blockMessage = e.message;
    } else {
      // Non-ChainWatch error — rethrow (could be a real system error).
      throw e;
    }
  }

  // --- Results ---
  console.log('  ' + '─'.repeat(64));
  if (blocked) {
    console.log('\n  🛑  CHAINWATCH BLOCKED THE WORM  🛑\n');
    console.log(`  ${blockMessage}\n`);
  }
  printEventTrail(engine.events);

  console.log('  ' + '─'.repeat(64));
  if (blocked) {
    console.log('\n  ✅  RESULT: Worm caught and blocked BEFORE exfiltration.');
    console.log('     The npm token was read but never left the machine.\n');
  } else {
    console.log('\n  ❌  RESULT: Worm was NOT blocked. Check policy thresholds.\n');
  }

  // --- Cleanup ---
  engine.uninstall();
  fs.rmSync(sandbox, { recursive: true, force: true });
}
