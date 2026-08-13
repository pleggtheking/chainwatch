import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createRequire } from 'node:module';

import { startRecording, stopRecording } from '../../src/baseline/recorder.js';
import { writeBaseline, readBaseline, compactBaseline } from '../../src/baseline/store.js';
import { diffBaseline } from '../../src/baseline/differ.js';
import { formatDriftReport } from '../../src/baseline/summarizer.js';

const require = createRequire(import.meta.url);

/**
 * Phase 3 integration test — the proof.
 *
 * 1. Record a baseline: run fake-drift-pkg.runClean() (only fs reads)
 * 2. Run fake-drift-pkg.runDrifted() (adds a network call to a raw IP)
 * 3. Assert: drift detected, score >= 50, network_out event in newEvents
 * 4. Assert: alert text contains package name and new behavior
 */
describe('Integration: drift detection (Phase 3 proof)', () => {
  let tmpDir: string;
  let baselineFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-drift-int-'));
    baselineFile = path.join(tmpDir, 'baseline.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records a clean baseline, then detects drift when a network call is added', () => {
    const driftPkg = require('fake-drift-pkg');

    // ─── Step 1: Record baseline with clean behavior ──────────────────────
    const rec1 = startRecording();
    try {
      driftPkg.runClean();
    } finally {
      stopRecording(rec1);
    }

    const baselineEvents = rec1.getEvents();
    expect(baselineEvents.length).toBeGreaterThan(0);
    // All baseline events should be attributed to fake-drift-pkg.
    expect(baselineEvents.every((e) => e.pkg.includes('fake-drift-pkg'))).toBe(true);

    // Write the baseline file.
    writeBaseline(baselineFile, baselineEvents);
    const baseline = compactBaseline(readBaseline(baselineFile));
    expect(baseline.events.size).toBeGreaterThan(0);

    // ─── Step 2: Run drifted behavior ─────────────────────────────────────
    const rec2 = startRecording();
    try {
      driftPkg.runDrifted();
    } finally {
      stopRecording(rec2);
    }

    const currentEvents = rec2.getEvents();

    // ─── Step 3: Diff and assert ──────────────────────────────────────────
    const results = diffBaseline(currentEvents, baseline);

    // There should be drift — the network call to 185.220.101.47 is new.
    expect(results.length).toBeGreaterThan(0);

    // Find the result with the network_out drift.
    const networkDrift = results.find((r) =>
      r.newEvents.some((e) => e.signal === 'network_out' && e.detail === '185.220.101.47'),
    );
    expect(networkDrift).toBeDefined();

    // Drift score should be >= 50 (raw IP network call = +50).
    expect(networkDrift!.driftScore).toBeGreaterThanOrEqual(50);

    // The network_out event should be in newEvents.
    const netEvent = networkDrift!.newEvents.find(
      (e) => e.signal === 'network_out' && e.detail === '185.220.101.47',
    );
    expect(netEvent).toBeDefined();

    // ─── Step 4: Alert text contains package and behavior ─────────────────
    const report = formatDriftReport(results, baseline, { useColor: false });
    expect(report).toContain('185.220.101.47');
    expect(report).toContain('network_out');
    expect(report).toContain('never seen before');
    expect(report).toContain('Drift score');
  });

  it('does NOT report drift when behavior matches baseline', () => {
    const driftPkg = require('fake-drift-pkg');

    // Record baseline.
    const rec1 = startRecording();
    try { driftPkg.runClean(); } finally { stopRecording(rec1); }
    writeBaseline(baselineFile, rec1.getEvents());
    const baseline = compactBaseline(readBaseline(baselineFile));

    // Run the SAME clean behavior again.
    const rec2 = startRecording();
    try { driftPkg.runClean(); } finally { stopRecording(rec2); }

    const results = diffBaseline(rec2.getEvents(), baseline);
    // No drift — behavior matches.
    expect(results).toEqual([]);
  });

  it('block-on-drift: drift score exceeds threshold when raw IP network call is added', () => {
    const driftPkg = require('fake-drift-pkg');

    // Record baseline.
    const rec1 = startRecording();
    try { driftPkg.runClean(); } finally { stopRecording(rec1); }
    writeBaseline(baselineFile, rec1.getEvents());
    const baseline = compactBaseline(readBaseline(baselineFile));

    // Run drifted behavior.
    const rec2 = startRecording();
    try { driftPkg.runDrifted(); } finally { stopRecording(rec2); }

    const results = diffBaseline(rec2.getEvents(), baseline);
    const threshold = 40;
    const shouldBlock = results.some((r) => r.driftScore >= threshold);

    // Should block because the raw IP network call scores 50 >= 40.
    expect(shouldBlock).toBe(true);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(threshold);
  });
});
