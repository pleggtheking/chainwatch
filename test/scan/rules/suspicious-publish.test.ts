import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { suspiciousPublish } from '../../../src/scan/rules/suspicious-publish.js';
import type { PackageMeta, RegistryMeta } from '../../../src/scan/types.js';

const FIXTURES = path.resolve(__dirname, '../../fixtures/node_modules');

function metaFor(name: string, version = '1.0.0'): PackageMeta {
  const pkgPath = path.join(FIXTURES, name);
  const raw = require(path.join(pkgPath, 'package.json'));
  return { name: raw.name ?? name, version, path: pkgPath, raw };
}

describe('Rule 5: suspicious_publish', () => {
  it('flags a typosquat package name (lodahs vs lodash)', async () => {
    const meta = metaFor('fake-typosquat');
    const findings = await suspiciousPublish.check(meta);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]!.description).toContain('typosquat');
    expect(findings[0]!.description).toContain('lodash');
  });

  it('flags a package published 2 hours ago by a new maintainer as HIGH', async () => {
    const meta = metaFor('fake-clean-pkg', '1.2.3');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fetcher = async (): Promise<RegistryMeta> => ({
      name: 'fake-clean-pkg',
      times: { '1.2.3': twoHoursAgo },
      maintainers: ['newbie'],
      'dist-tags': { latest: '1.2.3' },
    });
    const findings = await suspiciousPublish.check(meta, { fetchRegistryMeta: fetcher });
    const recent = findings.find((f) => f.description.includes('published'));
    expect(recent).toBeDefined();
    expect(recent!.severity).toBe('high');
    expect(recent!.description).toContain('2 hours');
  });

  it('flags typosquat + new publish + new maintainer as CRITICAL', async () => {
    const meta = metaFor('fake-typosquat', '1.0.0');
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const fetcher = async (): Promise<RegistryMeta> => ({
      name: 'lodahs',
      times: { '1.0.0': oneHourAgo },
      maintainers: ['attacker'],
      'dist-tags': { latest: '1.0.0' },
    });
    const findings = await suspiciousPublish.check(meta, { fetchRegistryMeta: fetcher });
    const crit = findings.find((f) => f.severity === 'critical');
    expect(crit).toBeDefined();
    expect(crit!.description).toContain('typosquat');
  });

  it('does NOT flag a clean, established package', async () => {
    const meta = metaFor('fake-clean-pkg', '1.0.0');
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const fetcher = async (): Promise<RegistryMeta> => ({
      name: 'fake-clean-pkg',
      times: { '1.0.0': longAgo },
      maintainers: ['veteran1', 'veteran2', 'veteran3', 'veteran4'],
      'dist-tags': { latest: '1.0.0' },
    });
    const findings = await suspiciousPublish.check(meta, { fetchRegistryMeta: fetcher });
    expect(findings).toEqual([]);
  });
});
