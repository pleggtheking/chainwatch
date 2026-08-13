/**
 * Rule 3: credential_file_access
 *
 * Flags packages whose source code references credential file paths:
 *  - ~/.npmrc, ~/.ssh/id_rsa, ~/.aws/credentials, .env
 *  - Windows: %APPDATA%\npm\, %USERPROFILE%\.ssh\
 *
 * Some packages (npm CLI, config tools) legitimately access npmrc — allowlist
 * by package name in policy.
 *
 * Severity: HIGH
 */

import * as path from 'node:path';
import type { Finding } from '../finding.js';
import type { Rule, PackageMeta } from '../types.js';
import { collectSourceFiles, readFileSafe, evidenceAround, lineOf } from '../util.js';

const CRED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\.npmrc/, label: '~/.npmrc' },
  { re: /\.ssh[\\/](?:id_rsa|id_ed25519|id_ecdsa)/, label: '~/.ssh/id_rsa' },
  { re: /\.aws[\\/]credentials/, label: '~/.aws/credentials' },
  { re: /\.aws[\\/]config/, label: '~/.aws/config' },
  // Match .env as a FILE reference, not process.env. Require a path separator,
  // quote, or start-of-string before .env to avoid matching process.env.X.
  { re: /(?:^|[/'"\\])\.env(?:['"\b]|$)/, label: '.env file' },
  { re: /dotenv\s*\(/, label: 'dotenv() call' },
  { re: /\.kube[\\/]config/, label: '~/.kube/config' },
  { re: /\.docker[\\/]config\.json/, label: '~/.docker/config.json' },
  { re: /\.git-credentials/, label: '~/.git-credentials' },
  { re: /\.netrc/, label: '~/.netrc' },
  { re: /%APPDATA%[\\/]npm/, label: '%APPDATA%\\npm' },
  { re: /%USERPROFILE%[\\/]\.ssh/, label: '%USERPROFILE%\\.ssh' },
];

const ALLOWLIST = new Set(['npm', 'yarn', 'pnpm', 'config', 'rc', 'dotenv']);

export const credentialFileAccess: Rule = {
  id: 'credential_file_access',
  check(meta: PackageMeta): Finding[] {
    const findings: Finding[] = [];
    if (ALLOWLIST.has(meta.name)) return findings;
    const pkgRef = `${meta.name}@${meta.version}`;

    for (const file of collectSourceFiles(meta.path)) {
      const content = readFileSafe(file);
      if (!content) continue;
      const relFile = path.relative(meta.path, file);

      for (const { re, label } of CRED_PATTERNS) {
        const m = content.match(re);
        if (m) {
          const matchStr = m[0] ?? '';
          findings.push({
            rule: 'credential_file_access',
            severity: 'high',
            package: pkgRef,
            description: `Source references credential file (${label})`,
            file: `${relFile}:${lineOf(content, matchStr)}`,
            evidence: evidenceAround(content, matchStr),
          });
          break; // one per file
        }
      }
    }

    return findings;
  },
};
