import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { postinstallShell } from '../../../src/scan/rules/postinstall-shell.js';
import type { PackageMeta } from '../../../src/scan/types.js';

const FIXTURES = path.resolve(__dirname, '../../fixtures/node_modules');

function metaFor(name: string): PackageMeta {
  const pkgPath = path.join(FIXTURES, name);
  const raw = require(path.join(pkgPath, 'package.json'));
  return { name, version: raw.version ?? '0.0.0', path: pkgPath, raw };
}

describe('Rule 2: postinstall_shell', () => {
  it('flags npm publish in postinstall as CRITICAL (worm propagation)', async () => {
    const findings = await postinstallShell.check(metaFor('fake-postinstall-shell'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const crit = findings.find((f) => f.severity === 'critical');
    expect(crit).toBeDefined();
    expect(crit!.description).toContain('npm publish');
  });

  it('does NOT flag a clean package', async () => {
    const findings = await postinstallShell.check(metaFor('fake-clean-pkg'));
    expect(findings).toEqual([]);
  });
});
