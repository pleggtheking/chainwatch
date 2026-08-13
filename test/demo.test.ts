import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * End-to-end test: ChainWatch catches and blocks a simulated Shai-Hulud worm.
 * This is the Phase 1 milestone.
 */
describe('ChainWatch live worm catch (Phase 1 milestone)', () => {
  let sandbox: string;
  let oldHome: string | undefined;
  let oldUserProfile: string | undefined;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'));
    fs.writeFileSync(
      path.join(sandbox, '.npmrc'),
      '//registry.npmjs.org/:_authToken=npm_TEST_fake_token\n',
    );
    oldHome = process.env.HOME;
    oldUserProfile = process.env.USERPROFILE;
    process.env.HOME = sandbox;
    process.env.USERPROFILE = sandbox;
  });

  afterEach(() => {
    if (oldHome !== undefined) process.env.HOME = oldHome;
    if (oldUserProfile !== undefined) process.env.USERPROFILE = oldUserProfile;
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('catches the full Shai-Hulud chain: credential_access → self_propagation → network_exfil', async () => {
    const { start, ChainWatchBlockError } = await import('../src/index.js');
    const engine = start();

    const worm = require('fake-worm');
    let blocked = false;
    try {
      await worm.infect();
    } catch (e) {
      if (e instanceof ChainWatchBlockError) {
        blocked = true;
      } else {
        throw e;
      }
    }

    engine.uninstall();

    // The worm was blocked.
    expect(blocked).toBe(true);

    // All three signals fired.
    const signals = engine.events.map((e) => e.signal);
    expect(signals).toContain('credential_access');
    expect(signals).toContain('self_propagation');
    expect(signals).toContain('network_exfil');

    // All events attributed to fake-worm (not <entry> or <unknown>).
    for (const e of engine.events) {
      expect(e.package).toBe('fake-worm');
    }

    // The credential access was flagged (not blocked — first in chain).
    const credEvent = engine.events.find((e) => e.signal === 'credential_access');
    expect(credEvent?.action).toBe('flag');

    // The self_propagation was blocked (chain score exceeded threshold).
    const propEvent = engine.events.find((e) => e.signal === 'self_propagation');
    expect(propEvent?.action).toBe('block');
    expect((propEvent?.detail.chainScore as number) ?? 0).toBeGreaterThanOrEqual(75);

    // The network_exfil was also blocked.
    const exfilEvent = engine.events.find((e) => e.signal === 'network_exfil');
    expect(exfilEvent?.action).toBe('block');
  });

  it('does NOT flag benign packages that only make allowlisted network calls', async () => {
    const { start } = await import('../src/index.js');
    const engine = start();

    // Make a request to an allowlisted host (registry.npmjs.org).
    // This should NOT fire network_exfil because it's in the allowlist.
    const http = require('node:http');
    const eventsBefore = engine.events.length;

    // dns.lookup to an allowlisted host should be fine.
    const dns = require('node:dns');
    await new Promise<void>((resolve) => {
      dns.lookup('registry.npmjs.org', () => resolve());
    });

    engine.uninstall();
    // No network_exfil events for allowlisted hosts.
    const exfilEvents = engine.events.filter((e) => e.signal === 'network_exfil');
    expect(exfilEvents.length).toBe(0);
  });
});
