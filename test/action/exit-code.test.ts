import { describe, it, expect } from 'vitest';
import { meetsSeverity, severityRank, SEVERITY_RANK } from '../../src/scan/finding.js';
import type { Severity } from '../../src/scan/finding.js';

describe('Exit-code behavior (severity thresholds)', () => {
  it('severityRank returns correct values', () => {
    expect(SEVERITY_RANK.low).toBe(1);
    expect(SEVERITY_RANK.medium).toBe(2);
    expect(SEVERITY_RANK.high).toBe(3);
    expect(SEVERITY_RANK.critical).toBe(4);
  });

  it('meetsSeverity: high finding meets high threshold', () => {
    expect(meetsSeverity('high', 'high')).toBe(true);
  });

  it('meetsSeverity: critical finding meets high threshold', () => {
    expect(meetsSeverity('critical', 'high')).toBe(true);
  });

  it('meetsSeverity: medium finding does NOT meet high threshold', () => {
    expect(meetsSeverity('medium', 'high')).toBe(false);
  });

  it('meetsSeverity: low finding does NOT meet medium threshold', () => {
    expect(meetsSeverity('low', 'medium')).toBe(false);
  });

  it('meetsSeverity: medium finding meets low threshold', () => {
    expect(meetsSeverity('medium', 'low')).toBe(true);
  });

  it('meetsSeverity: critical meets all thresholds', () => {
    expect(meetsSeverity('critical', 'low')).toBe(true);
    expect(meetsSeverity('critical', 'medium')).toBe(true);
    expect(meetsSeverity('critical', 'high')).toBe(true);
    expect(meetsSeverity('critical', 'critical')).toBe(true);
  });

  it('severityRank handles unknown severity gracefully', () => {
    expect(severityRank('unknown' as Severity)).toBe(0);
  });
});

describe('Exit-code logic (simulating Action behavior)', () => {
  // Simulates the shouldFail check from main.ts
  function shouldFail(findings: { severity: Severity }[], failOn: Severity): boolean {
    return findings.some((f) => meetsSeverity(f.severity, failOn));
  }

  it('exits 0 on zero findings', () => {
    expect(shouldFail([], 'high')).toBe(false);
  });

  it('exits 0 when findings are below fail-on threshold', () => {
    const findings = [{ severity: 'medium' as Severity }, { severity: 'low' as Severity }];
    expect(shouldFail(findings, 'high')).toBe(false);
  });

  it('exits 1 when findings are at fail-on threshold', () => {
    const findings = [{ severity: 'high' as Severity }];
    expect(shouldFail(findings, 'high')).toBe(true);
  });

  it('exits 1 when findings exceed fail-on threshold', () => {
    const findings = [{ severity: 'critical' as Severity }];
    expect(shouldFail(findings, 'high')).toBe(true);
  });

  it('exits 1 when any finding meets threshold (mixed)', () => {
    const findings = [
      { severity: 'low' as Severity },
      { severity: 'medium' as Severity },
      { severity: 'high' as Severity },
    ];
    expect(shouldFail(findings, 'high')).toBe(true);
  });
});
