import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { obfuscationScore } from '../../../src/scan/rules/obfuscation-score.js';
import type { PackageMeta } from '../../../src/scan/types.js';

const FIXTURES = path.resolve(__dirname, '../../fixtures/node_modules');

function metaFor(name: string): PackageMeta {
  const pkgPath = path.join(FIXTURES, name);
  const raw = require(path.join(pkgPath, 'package.json'));
  return { name, version: raw.version ?? '0.0.0', path: pkgPath, raw };
}

describe('Rule 4: obfuscation_score', () => {
  it('flags a package with hex-encoded eval', async () => {
    const findings = await obfuscationScore.check(metaFor('fake-obfuscated'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.rule).toBe('obfuscation_score');
    expect((findings[0]!.chainScore ?? 0)).toBeGreaterThanOrEqual(60);
    expect(findings[0]!.description).toContain('hex');
  });

  it('does NOT flag a clean package', async () => {
    const findings = await obfuscationScore.check(metaFor('fake-clean-pkg'));
    expect(findings).toEqual([]);
  });
});
