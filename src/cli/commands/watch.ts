/**
 * `chainwatch watch` — run a command under the live runtime interceptor.
 *
 * Spawns the user's command as a child process with the ChainWatch preload
 * injected via NODE_OPTIONS="--import <preload>". Events stream back via a
 * JSONL log file that the parent tails in real time.
 *
 * With --drift, uses the recorder preload instead and compares behavior
 * to a recorded baseline after the run.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ChainWatchEvent } from '../../events.js';
import { formatEvent } from '../../reporter/index.js';
import { readBaseline, compactBaseline } from '../../baseline/store.js';
import { diffBaseline, type DriftResult } from '../../baseline/differ.js';
import { formatDriftReport } from '../../baseline/summarizer.js';
import type { BaselineEvent } from '../../baseline/types.js';

const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);

export function registerWatch(program: Command): void {
  program
    .command('watch [args...]')
    .description('Run a command under live ChainWatch monitoring')
    .option('--block', 'Block on HIGH+ (default: warn only)')
    .option('--block-on <lvl>', 'Block threshold: low|medium|high|critical', 'critical')
    .option('-o, --output <fmt>', 'Output format: pretty | json', 'pretty')
    .option('--log <file>', 'Append events to a JSONL log file')
    .option('--drift', 'Enable drift detection (requires baseline)')
    .option('--baseline <file>', 'Baseline file to compare against', '.chainwatch/baseline.jsonl')
    .option('--drift-threshold <n>', 'Drift score to trigger alert (0–100)', '40')
    .option('--block-on-drift', 'Block the process if drift score exceeds threshold')
    .option('--sync', 'Push events to ChainWatch Cloud after run')
    .allowUnknownOption(true)
    .action(async (args: string[], opts: WatchCliOpts) => {
      const cmdArgs = extractCommandArgs();
      if (cmdArgs.length === 0) {
        console.error('Usage: chainwatch watch -- <command>');
        console.error('Example: chainwatch watch -- node server.js');
        process.exit(1);
      }
      if (opts.drift) {
        await runDriftWatch(cmdArgs, opts);
      } else {
        await runWatch(cmdArgs, opts);
      }
    });
}

interface WatchCliOpts {
  block?: boolean;
  blockOn?: string;
  output?: string;
  log?: string;
  drift?: boolean;
  baseline?: string;
  driftThreshold?: string;
  blockOnDrift?: boolean;
  sync?: boolean;
}

function extractCommandArgs(): string[] {
  const idx = process.argv.indexOf('--');
  if (idx === -1) return [];
  return process.argv.slice(idx + 1);
}

// ─── Standard watch (Phase 1 interceptor) ───────────────────────────────────

async function runWatch(cmdArgs: string[], opts: WatchCliOpts): Promise<void> {
  const eventLogPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'chainwatch-watch-')),
    'events.jsonl',
  );

  const preloadPath = resolvePreload('preload.js');
  const preloadUrl = pathToFileURL(preloadPath).href;

  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import ${preloadUrl}`.trim(),
    CHAINWATCH_EVENT_LOG: eventLogPath,
  };

  const [cmd = '', ...rest] = cmdArgs;
  const child: ChildProcess = spawn(cmd, rest, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log(`ChainWatch watching: ${cmdArgs.join(' ')}`);
  console.log(`Policy: default (warn on high, block on ${opts.blockOn ?? 'critical'})\n`);

  const events: ChainWatchEvent[] = [];
  let lastSize = 0;

  const tailInterval = setInterval(() => {
    try {
      const stat = fs.statSync(eventLogPath);
      if (stat.size > lastSize) {
        const content = fs.readFileSync(eventLogPath, 'utf8');
        const lines = content.slice(lastSize).split('\n').filter(Boolean);
        lastSize = stat.size;
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as ChainWatchEvent;
            events.push(event);
            printWatchEvent(event, opts);
          } catch { /* incomplete line */ }
        }
      }
    } catch { /* file doesn't exist yet */ }
  }, 100);

  const exitCode = await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(`chainwatch: failed to spawn command: ${err.message}`);
      resolve(1);
    });
  });

  clearInterval(tailInterval);
  flushRemainingEvents(eventLogPath, lastSize, events, opts);

  console.log('\n  ' + '─'.repeat(50));
  const blocked = events.filter((e) => e.action === 'block').length;
  const flagged = events.filter((e) => e.action === 'flag').length;
  console.log(`  Watch complete. ${events.length} events — ${blocked} blocked, ${flagged} flagged`);
  console.log(`  Command exit code: ${exitCode}`);

  if (opts.log) {
    try { for (const e of events) fs.appendFileSync(opts.log, JSON.stringify(e) + '\n'); } catch { /* */ }
  }

  // Sync to cloud if --sync flag is set.
  if (opts.sync && events.length > 0) {
    const { syncFindings, detectRepoName } = await import('../../sync/client.js');
    const repo = await detectRepoName() ?? undefined;
    // Convert ChainWatchEvents to Findings for sync.
    const findings = events.map((e) => ({
      rule: e.signal,
      severity: e.severity,
      package: e.package,
      description: e.detail,
      chain_score: e.score,
    }));
    const runId = `watch-${Date.now()}`;
    const syncResult = await syncFindings(findings as any, runId, { repo });
    if (!syncResult.skipped && !syncResult.error) {
      console.log(`  Synced ${syncResult.ingested} events to cloud.`);
    } else if (syncResult.error) {
      console.error(`  Sync failed: ${syncResult.error}`);
    }
  }

  try { fs.rmSync(path.dirname(eventLogPath), { recursive: true, force: true }); } catch { /* */ }
  process.exit(exitCode);
}

function flushRemainingEvents(
  logPath: string,
  lastSize: number,
  events: ChainWatchEvent[],
  opts: WatchCliOpts,
): void {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.slice(lastSize).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as ChainWatchEvent;
        events.push(event);
        printWatchEvent(event, opts);
      } catch { /* */ }
    }
  } catch { /* */ }
}

function printWatchEvent(e: ChainWatchEvent, opts: WatchCliOpts): void {
  if (opts.output === 'json') {
    console.log(JSON.stringify(e));
  } else {
    console.log(formatEvent(e));
  }
}

// ─── Drift watch (Phase 3) ──────────────────────────────────────────────────

async function runDriftWatch(cmdArgs: string[], opts: WatchCliOpts): Promise<void> {
  const baselinePath = path.resolve(opts.baseline ?? '.chainwatch/baseline.jsonl');
  const driftThreshold = parseInt(opts.driftThreshold ?? '40', 10);

  // Load baseline.
  const baselineEvents = readBaseline(baselinePath);
  if (baselineEvents.length === 0) {
    console.error(`No baseline found at ${baselinePath}`);
    console.error('Run `chainwatch baseline record -- <cmd>` to create one.');
    process.exit(1);
  }
  const baseline = compactBaseline(baselineEvents);

  const recorderLogPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'chainwatch-drift-')),
    'recorder.jsonl',
  );

  const preloadPath = resolvePreload('recorder-preload.js');
  const preloadUrl = pathToFileURL(preloadPath).href;

  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import ${preloadUrl}`.trim(),
    CHAINWATCH_RECORDER_LOG: recorderLogPath,
  };

  const [cmd = '', ...rest] = cmdArgs;
  const child: ChildProcess = spawn(cmd, rest, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  console.log(`ChainWatch watching: ${cmdArgs.join(' ')} [drift detection ON]`);
  console.log(`Baseline: ${baselinePath} (${baseline.events.size} events, ${baseline.runCount} runs)\n`);

  // Tail the recorder log for real-time event count.
  let lastSize = 0;
  const tailInterval = setInterval(() => {
    try {
      const stat = fs.statSync(recorderLogPath);
      if (stat.size > lastSize) lastSize = stat.size;
    } catch { /* */ }
  }, 100);

  let killed = false;
  if (opts.blockOnDrift) {
    // Check for drift periodically and kill if threshold exceeded.
    const checkInterval = setInterval(() => {
      try {
        const content = fs.readFileSync(recorderLogPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const events: BaselineEvent[] = [];
        for (const line of lines) {
          try { events.push(JSON.parse(line)); } catch { /* */ }
        }
        const results = diffBaseline(events, baseline);
        const highDrift = results.filter((r) => r.driftScore >= driftThreshold);
        if (highDrift.length > 0 && !killed) {
          killed = true;
          console.log('\n  🛑 Drift threshold exceeded — killing process\n');
          child.kill('SIGKILL');
        }
      } catch { /* */ }
    }, 500);
    child.on('exit', () => clearInterval(checkInterval));
  }

  const exitCode = await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(`chainwatch: failed to spawn command: ${err.message}`);
      resolve(1);
    });
  });

  clearInterval(tailInterval);

  // Give the child's process.on('exit') handler time to flush remaining events
  // to the recorder log file. Without this delay, we may read the file before
  // the child's exit handler has written the final batch.
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Read all recorded events and compute drift.
  const recordedEvents: BaselineEvent[] = [];
  try {
    const content = fs.readFileSync(recorderLogPath, 'utf8');
    for (const line of content.split('\n').filter(Boolean)) {
      try { recordedEvents.push(JSON.parse(line)); } catch { /* */ }
    }
  } catch { /* */ }

  const results = diffBaseline(recordedEvents, baseline);
  const useColor = process.stdout.isTTY;
  const aboveThreshold = results.filter((r) => r.driftScore >= driftThreshold);

  console.log('\n  ' + '─'.repeat(50));
  console.log(formatDriftReport(results, baseline, { useColor }));

  if (opts.log) {
    try { for (const r of results) fs.appendFileSync(opts.log, JSON.stringify(r) + '\n'); } catch { /* */ }
  }

  try { fs.rmSync(path.dirname(recorderLogPath), { recursive: true, force: true }); } catch { /* */ }

  const finalExit = (killed || aboveThreshold.length > 0) ? 1 : exitCode;
  process.exit(finalExit);
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function resolvePreload(filename: string): string {
  const candidates = [
    path.resolve(__dirname_esm, `../${filename}`),
    path.resolve(__dirname_esm, `../../${filename}`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]!;
}
