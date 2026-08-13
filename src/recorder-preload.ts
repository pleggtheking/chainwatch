/**
 * ChainWatch recorder preload — loaded via `node --import chainwatch/recorder-preload`
 * to record ALL behavioral events during a baseline recording or drift watch session.
 *
 * Events are streamed to a JSONL file (path from CHAINWATCH_RECORDER_LOG env var)
 * so the parent process can tail them in real time. On exit, any remaining
 * buffered events are flushed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { startRecording } from './baseline/recorder.js';
import { normalizeDetail } from './baseline/store.js';
import type { BaselineEvent } from './baseline/types.js';

const recorderLog = process.env['CHAINWATCH_RECORDER_LOG'];
const baselineFile = process.env['CHAINWATCH_BASELINE_FILE'];
const baselineTag = process.env['CHAINWATCH_BASELINE_TAG'];

if (process.env['CHAINWATCH_DEBUG']) {
  process.stderr.write(`[chainwatch recorder] preload loaded, baseline=${baselineFile}, log=${recorderLog}\n`);
}

const recorder = startRecording();

if (process.env['CHAINWATCH_DEBUG']) {
  process.stderr.write(`[chainwatch recorder] recording started\n`);
}

// Stream events to the log file if configured.
if (recorderLog) {
  // We poll the recorder's event count and flush new events periodically.
  let lastFlushedCount = 0;
  const flushInterval = setInterval(() => {
    const events = recorder.getEvents(baselineTag);
    if (events.length > lastFlushedCount) {
      const newEvents = events.slice(lastFlushedCount);
      lastFlushedCount = events.length;
      try {
        fs.appendFileSync(recorderLog, newEvents.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
      } catch {
        // best effort
      }
    }
  }, 200);
  flushInterval.unref(); // Don't keep the event loop alive just for flushing.

  // Clean up interval on exit.
  process.on('exit', () => {
    clearInterval(flushInterval);
    // Final flush.
    const events = recorder.getEvents(baselineTag);
    if (events.length > lastFlushedCount) {
      const newEvents = events.slice(lastFlushedCount);
      try {
        fs.appendFileSync(recorderLog, newEvents.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
      } catch {
        // best effort
      }
    }
  });
} else if (baselineFile) {
  // No streaming log — just write to baseline file on exit.
  process.on('exit', () => {
    const events = recorder.getEvents(baselineTag);
    if (process.env['CHAINWATCH_DEBUG']) {
      process.stderr.write(`[chainwatch recorder] exit: ${events.length} events, writing to ${baselineFile}\n`);
    }
    if (events.length > 0) {
      try {
        // Ensure the directory exists.
        const dir = path.dirname(baselineFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(baselineFile, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
      } catch (e) {
        if (process.env['CHAINWATCH_DEBUG']) {
          process.stderr.write(`[chainwatch recorder] write error: ${(e as Error).message}\n`);
        }
      }
    }
  });
}

export { recorder };
