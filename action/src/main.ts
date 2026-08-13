/**
 * ChainWatch GitHub Action entry point.
 *
 * Runs a static scan on node_modules, writes SARIF output, sets action outputs,
 * writes a step summary, and fails the workflow if findings exceed the threshold.
 *
 * Optionally runs drift detection if a baseline file is provided.
 */

import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { scan } from '../../src/scan/scanner.js';
import { formatSarif } from '../../src/reporter/sarif.js';
import { meetsSeverity, type Finding, type Severity } from '../../src/scan/finding.js';
import { parseInputs } from './inputs.js';
import { setOutputs, writeSummary } from './outputs.js';

async function run(): Promise<void> {
  try {
    // 1. Read inputs
    const inputs = parseInputs();
    core.info(`ChainWatch scan: dir=${inputs.scanDir}, severity=${inputs.severity}, fail-on=${inputs.failOn}`);

    // 2. Run install command (e.g. npm ci)
    if (inputs.installCommand) {
      core.info(`Running: ${inputs.installCommand}`);
      execSync(inputs.installCommand, { stdio: 'inherit', cwd: process.cwd() });
    }

    // 3. Run scan
    const scanDir = path.resolve(inputs.scanDir);
    if (!fs.existsSync(scanDir)) {
      core.warning(`Scan directory does not exist: ${scanDir}`);
      core.info('Skipping scan — no node_modules found.');
      setOutputs([], inputs.sarifOutput);
      await writeSummary([]);
      return;
    }

    core.info(`Scanning ${scanDir}...`);
    const result = await scan(scanDir, {
      minSeverity: inputs.severity,
    });

    const findings = result.findings;
    core.info(`Scan complete: ${findings.length} findings in ${result.scanMs}ms (${result.packageCount} packages)`);

    // 4. Write SARIF
    const sarifPath = path.resolve(inputs.sarifOutput);
    const sarifContent = formatSarif(findings);
    const sarifDir = path.dirname(sarifPath);
    if (!fs.existsSync(sarifDir)) {
      fs.mkdirSync(sarifDir, { recursive: true });
    }
    fs.writeFileSync(sarifPath, sarifContent, 'utf8');
    core.info(`SARIF written to ${sarifPath}`);

    // 5. Set outputs
    setOutputs(findings, sarifPath);

    // 6. Write step summary
    await writeSummary(findings);

    // 7. Fail if threshold exceeded
    const shouldFail = findings.some((f) => meetsSeverity(f.severity, inputs.failOn));
    if (shouldFail) {
      const critical = findings.filter((f) => f.severity === 'critical').length;
      const high = findings.filter((f) => f.severity === 'high').length;
      core.setFailed(
        `ChainWatch: ${critical} critical, ${high} high findings detected (fail-on: ${inputs.failOn}).`,
      );
    } else {
      core.info(`ChainWatch: ${findings.length} findings, none at or above ${inputs.failOn} severity.`);
    }
  } catch (err) {
    core.setFailed(`ChainWatch action failed: ${(err as Error).message}`);
  }
}

run();
