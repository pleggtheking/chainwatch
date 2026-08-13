import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { credentialFileAccess } from '../../../src/scan/rules/credential-file-access.js';
import type { PackageMeta } from '../../../src/scan/types.js';

const FIXTURES = path.resolve(__dirname, '../../fixtures/node_modules');

function metaFor(name: string): PackageMeta {
  const pkgPath = path.join(FIXTURES, name);
  const raw = require(path.join(pkgPath, 'package.json'));
  return { name, version: raw.version ?? '0.0.0', path: pkgPath, raw };
}

describe('Rule 3: credential_file_access', () => {
  it('flags a package that reads ~/.npmrc', async () => {
    const findings = await credentialFileAccess.check(metaFor('fake-credential-reader'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.rule).toBe('credential_file_access');
    expect(findings[0]!.severity).toBe('high');
    expect(findings[0]!.description).toContain('.npmrc');
  });

  it('does NOT flag a clean package', async () => {
    const findings = await credentialFileAccess.check(metaFor('fake-clean-pkg'));
    expect(findings).toEqual([]);
  });

  it('does NOT flag the npm CLI itself (allowlisted)', async () => {
    const meta: PackageMeta = {
      name: 'npm',
      version: '10.0.0',
      path: path.join(FIXTURES, 'fake-credential-reader'),
      raw: {},
    };
    const findings = await credentialFileAccess.check(meta);
    expect(findings).toEqual([]);
  });
});
