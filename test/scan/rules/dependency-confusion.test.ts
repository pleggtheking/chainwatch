import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { dependencyConfusion } from '../../../src/scan/rules/dependency-confusion.js';
import type { PackageMeta, RuleContext } from '../../../src/scan/types.js';

const FIXTURES = path.resolve(__dirname, '../../fixtures/node_modules');

function metaFor(name: string): PackageMeta {
  const pkgPath = path.join(FIXTURES, name);
  const raw = require(path.join(pkgPath, 'package.json'));
  return { name: raw.name, version: raw.version, path: pkgPath, raw };
}

describe('Rule 6: dependency_confusion', () => {
  let tmpDir: string;
  let oldCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-depconf-'));
    oldCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(oldCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('flags a scoped package resolved from public registry when private is configured', () => {
    // Write .npmrc configuring a private registry for @myorg
    fs.writeFileSync(
      path.join(tmpDir, '.npmrc'),
      '@myorg:registry=https://npm.private.corp/\n',
    );
    // Write package-lock showing the package resolved from PUBLIC registry
    const lock = {
      packages: {
        '@myorg/internal-lib': {
          version: '99.0.0',
          resolved: 'https://registry.npmjs.org/@myorg/internal-lib/-/internal-lib-99.0.0.tgz',
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify(lock));

    const meta = metaFor('fake-dependency-confusion');
    const ctx: RuleContext = { packageLock: lock };
    const findings = dependencyConfusion.check(meta, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0]!.rule).toBe('dependency_confusion');
    expect(findings[0]!.severity).toBe('critical');
    expect(findings[0]!.description).toContain('public npm registry');
  });

  it('does NOT flag when the scoped package resolved from the private registry', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.npmrc'),
      '@myorg:registry=https://npm.private.corp/\n',
    );
    const lock = {
      packages: {
        '@myorg/internal-lib': {
          version: '1.0.0',
          resolved: 'https://npm.private.corp/@myorg/internal-lib/-/internal-lib-1.0.0.tgz',
        },
      },
    };
    const meta = metaFor('fake-dependency-confusion');
    const ctx: RuleContext = { packageLock: lock };
    const findings = dependencyConfusion.check(meta, ctx);
    expect(findings).toEqual([]);
  });

  it('does NOT flag unscoped packages', () => {
    const meta: PackageMeta = {
      name: 'lodash',
      version: '4.0.0',
      path: path.join(FIXTURES, 'fake-clean-pkg'),
      raw: {},
    };
    const findings = dependencyConfusion.check(meta);
    expect(findings).toEqual([]);
  });
});
