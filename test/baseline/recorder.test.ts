import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createRequire } from 'node:module';

import { startRecording, stopRecording } from '../../src/baseline/recorder.js';
import { normalizePath } from '../../src/baseline/store.js';

const require = createRequire(import.meta.url);

describe('Baseline recorder', () => {
  let sandbox: string;
  let oldHome: string | undefined;
  let oldUserProfile: string | undefined;

  beforeEach(() => {
    // Create sandbox under the real home dir so it normalizes to {HOME}.
    const home = os.homedir();
    sandbox = fs.mkdtempSync(path.join(home, '.cw-rec-'));
    oldHome = process.env.HOME;
    oldUserProfile = process.env.USERPROFILE;
    process.env.HOME = sandbox;
    process.env.USERPROFILE = sandbox;
  });

  afterEach(() => {
    if (oldHome !== undefined) process.env.HOME = oldHome;
    if (oldUserProfile !== undefined) process.env.USERPROFILE = oldUserProfile;
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('records fs_read events with normalized paths', () => {
    const rec = startRecording();
    try {
      // Read a file — use a file inside the sandbox (which is HOME)
      const testFile = path.join(sandbox, 'test.txt');
      fs.writeFileSync(testFile, 'hello');
      const cjsFs = require('node:fs');
      cjsFs.readFileSync(testFile, 'utf8');
    } finally {
      stopRecording(rec);
    }

    const events = rec.getEvents();
    const reads = events.filter((e) => e.signal === 'fs_read');
    expect(reads.length).toBeGreaterThanOrEqual(1);
    // Path should be normalized — {HOME} replaces the home dir prefix.
    const testRead = reads.find((e) => e.detail.includes('test.txt'));
    expect(testRead).toBeDefined();
    expect(testRead!.detail.startsWith('{HOME}/')).toBe(true);
  });

  it('records network_out events with host', () => {
    const rec = startRecording();
    try {
      const http = require('node:http');
      // Just call the function — it will fail to connect but the recorder
      // captures the call before it executes.
      try {
        http.request({ hostname: 'example.com', port: 9999 }, () => {}).on('error', () => {}).end();
      } catch {
        // ignore connection errors
      }
    } finally {
      stopRecording(rec);
    }

    const events = rec.getEvents();
    const netEvents = events.filter((e) => e.signal === 'network_out');
    expect(netEvents.length).toBeGreaterThanOrEqual(1);
    expect(netEvents.some((e) => e.detail === 'example.com')).toBe(true);
  });

  it('records child_process events with command', () => {
    const rec = startRecording();
    try {
      const cp = require('node:child_process');
      try {
        cp.execSync('echo hello', { timeout: 1000 });
      } catch {
        // ignore
      }
    } finally {
      stopRecording(rec);
    }

    const events = rec.getEvents();
    const cpEvents = events.filter((e) => e.signal === 'child_process');
    expect(cpEvents.length).toBeGreaterThanOrEqual(1);
    expect(cpEvents.some((e) => e.detail.includes('echo'))).toBe(true);
  });

  it('aggregates counts for repeated same (pkg, signal, detail)', () => {
    const rec = startRecording();
    try {
      const testFile = path.join(sandbox, 'repeat.txt');
      fs.writeFileSync(testFile, 'data');
      const cjsFs = require('node:fs');
      cjsFs.readFileSync(testFile, 'utf8');
      cjsFs.readFileSync(testFile, 'utf8');
      cjsFs.readFileSync(testFile, 'utf8');
    } finally {
      stopRecording(rec);
    }

    const events = rec.getEvents();
    const repeatRead = events.find((e) => e.detail.includes('repeat.txt'));
    expect(repeatRead).toBeDefined();
    expect(repeatRead!.count).toBe(3);
  });

  it('does not record ChainWatch\'s own internal operations', () => {
    const rec = startRecording();
    try {
      // The recorder's own file reads should not be attributed to chainwatch
      // (they're filtered out in the record() method).
      const cjsFs = require('node:fs');
      cjsFs.readFileSync(path.join(sandbox, 'x.txt'), 'utf8'); // will throw, that's ok
    } catch {
      // ignore
    } finally {
      stopRecording(rec);
    }

    const events = rec.getEvents();
    // Should not have events attributed to 'chainwatch'
    expect(events.filter((e) => e.pkg === 'chainwatch')).toEqual([]);
  });

  it('uninstall restores original functions', () => {
    const rec = startRecording();
    stopRecording(rec);

    // After uninstall, the recorder should not capture events.
    const cjsFs = require('node:fs');
    const testFile = path.join(sandbox, 'after.txt');
    fs.writeFileSync(testFile, 'data');
    cjsFs.readFileSync(testFile, 'utf8');

    // getEvents should only contain events from before uninstall
    const events = rec.getEvents();
    expect(events.find((e) => e.detail.includes('after.txt'))).toBeUndefined();
  });
});
