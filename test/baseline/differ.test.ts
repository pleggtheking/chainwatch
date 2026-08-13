import { describe, it, expect } from 'vitest';
import { diffBaseline } from '../../src/baseline/differ.js';
import { compactBaseline } from '../../src/baseline/store.js';
import type { BaselineEvent } from '../../src/baseline/types.js';

function makeEvent(pkg: string, signal: BaselineEvent['signal'], detail: string, count = 1): BaselineEvent {
  return { pkg, signal, detail, count, run: '2026-08-13T10:00:00Z' };
}

describe('Drift scorer (differ)', () => {
  it('scores new network_out to raw IP as +50', () => {
    const baseline = compactBaseline([
      makeEvent('some-pkg@1.0.0', 'fs_read', '{CWD}/src/index.ts'),
    ]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_read', '{CWD}/src/index.ts'),
      makeEvent('some-pkg@1.0.0', 'network_out', '185.220.101.47'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results).toHaveLength(1);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(50);
    expect(results[0]!.newEvents.some((e) => e.detail === '185.220.101.47')).toBe(true);
  });

  it('scores new network_out to hostname as +30', () => {
    const baseline = compactBaseline([
      makeEvent('some-pkg@1.0.0', 'fs_read', '{CWD}/src/index.ts'),
    ]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_read', '{CWD}/src/index.ts'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'evil.example.com'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(30);
  });

  it('scores fs_read of credential file as +40', () => {
    const baseline = compactBaseline([]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_read', '{HOME}/.npmrc'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(40);
  });

  it('scores child_process not in baseline as +35', () => {
    const baseline = compactBaseline([]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'child_process', 'npm publish'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(35);
  });

  it('scores dns_lookup of new domain as +25', () => {
    const baseline = compactBaseline([]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'dns_lookup', 'evil.example.com'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(25);
  });

  it('scores fs_write outside CWD as +30', () => {
    const baseline = compactBaseline([]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_write', '{HOME}/.ssh/authorized_keys'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(30);
  });

  it('adds chain bonus (+20) for signal after credential read', () => {
    const baseline = compactBaseline([]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_read', '{HOME}/.npmrc'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'evil.example.com'),
    ];
    const results = diffBaseline(current, baseline);
    // fs_read cred: +40, network_out hostname: +30, chain bonus: +20 = 90
    expect(results[0]!.driftScore).toBeGreaterThanOrEqual(80);
  });

  it('caps drift score at 100', () => {
    const baseline = compactBaseline([]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_read', '{HOME}/.npmrc'),
      makeEvent('some-pkg@1.0.0', 'network_out', '185.220.101.47'),
      makeEvent('some-pkg@1.0.0', 'child_process', 'npm publish'),
      makeEvent('some-pkg@1.0.0', 'dns_lookup', 'evil.example.com'),
      makeEvent('some-pkg@1.0.0', 'fs_write', '{HOME}/.ssh/authorized_keys'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results[0]!.driftScore).toBe(100);
  });

  it('reports no drift when behavior matches baseline', () => {
    const baseline = compactBaseline([
      makeEvent('some-pkg@1.0.0', 'fs_read', '{CWD}/src/index.ts'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'registry.npmjs.org'),
    ]);
    const current = [
      makeEvent('some-pkg@1.0.0', 'fs_read', '{CWD}/src/index.ts'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'registry.npmjs.org'),
    ];
    const results = diffBaseline(current, baseline);
    expect(results).toEqual([]);
  });

  it('reports missing events at low priority (max 20 points)', () => {
    const baseline = compactBaseline([
      makeEvent('some-pkg@1.0.0', 'network_out', 'registry.npmjs.org'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'cdn.example.com'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'api.example.com'),
      makeEvent('some-pkg@1.0.0', 'network_out', 'ws.example.com'),
    ]);
    const current: BaselineEvent[] = [];
    const results = diffBaseline(current, baseline);
    expect(results).toHaveLength(1);
    // 4 missing events × 10 = 40, capped at 20
    expect(results[0]!.driftScore).toBe(20);
    expect(results[0]!.missingEvents.length).toBe(4);
  });

  it('assigns correct severity based on score', () => {
    const baseline = compactBaseline([]);
    // Score 50 (raw IP) → medium (>= 40)
    const medium = diffBaseline([makeEvent('p@1', 'network_out', '1.2.3.4')], baseline);
    expect(medium[0]!.severity).toBe('medium');

    // Score 90 (cred + IP + chain) → critical (>= 85)
    const critical = diffBaseline([
      makeEvent('p@2', 'fs_read', '{HOME}/.npmrc'),
      makeEvent('p@2', 'network_out', '1.2.3.4'),
    ], baseline);
    expect(critical[0]!.severity).toBe('critical');
  });
});
