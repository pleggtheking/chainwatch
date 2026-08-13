/**
 * Rule 2: postinstall_shell
 *
 * Flags install scripts that spawn shells with suspicious patterns:
 *  - exec/execSync/spawn with sh -c, bash -c, cmd /c
 *  - PowerShell encoded commands (-enc / -EncodedCommand)
 *  - npm publish, npm login, npm whoami (worm propagation)
 *
 * Severity: CRITICAL (propagation), HIGH (generic shell)
 */

import * as path from 'node:path';
import type { Finding } from '../finding.js';
import type { Rule, PackageMeta } from '../types.js';
import { collectSourceFiles, readFileSafe, getScripts, evidenceAround, lineOf } from '../util.js';

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];

const PROPAGATION_RE = /\b(?:npm\s+(?:publish|login|whoami|token|adduser)|yarn\s+publish|pnpm\s+publish)\b/;
const SHELL_SPAWN_RE = /\b(?:exec(?:Sync)?|spawn(?:Sync)?|fork)\s*\(/;
const SHELL_CMD_RE = /\b(?:sh\s+-c|bash\s+-c|cmd\s+\/c|powershell.*-enc|powershell.*-EncodedCommand)\b/;

export const postinstallShell: Rule = {
  id: 'postinstall_shell',
  check(meta: PackageMeta): Finding[] {
    const findings: Finding[] = [];
    const scripts = getScripts(meta.raw);
    const pkgRef = `${meta.name}@${meta.version}`;
    const installScripts = INSTALL_SCRIPTS.filter((s) => scripts[s]);
    if (installScripts.length === 0) return findings;

    // Check shell strings in package.json scripts.
    for (const scriptName of installScripts) {
      const body = scripts[scriptName] ?? '';
      if (PROPAGATION_RE.test(body)) {
        findings.push({
          rule: 'postinstall_shell',
          severity: 'critical',
          package: pkgRef,
          description: `${scriptName} script runs npm publish/login — worm propagation pattern`,
          evidence: evidenceAround(body, 'npm'),
        });
      } else if (SHELL_CMD_RE.test(body)) {
        findings.push({
          rule: 'postinstall_shell',
          severity: 'high',
          package: pkgRef,
          description: `${scriptName} script spawns a shell (${body.slice(0, 60)})`,
          evidence: evidenceAround(body, 'sh'),
        });
      }
    }

    // Check JS source files.
    for (const file of collectSourceFiles(meta.path)) {
      const content = readFileSafe(file);
      if (!content) continue;
      const relFile = path.relative(meta.path, file);

      if (PROPAGATION_RE.test(content)) {
        const m = content.match(PROPAGATION_RE);
        const matchStr = m?.[0] ?? '';
        findings.push({
          rule: 'postinstall_shell',
          severity: 'critical',
          package: pkgRef,
          description: `Install script spawns \`${matchStr}\` — matches worm propagation pattern`,
          file: `${relFile}:${lineOf(content, matchStr)}`,
          evidence: evidenceAround(content, matchStr),
        });
      }
      if (SHELL_SPAWN_RE.test(content) && SHELL_CMD_RE.test(content)) {
        const m = content.match(SHELL_CMD_RE);
        const matchStr = m?.[0] ?? '';
        findings.push({
          rule: 'postinstall_shell',
          severity: 'high',
          package: pkgRef,
          description: `Install script spawns shell: ${matchStr}`,
          file: `${relFile}:${lineOf(content, matchStr)}`,
          evidence: evidenceAround(content, matchStr),
        });
      }
    }

    return findings;
  },
};
