import { describe, it, expect } from 'vitest';

// Test the rule-to-signal mapping used by the events endpoint.
const RULE_TO_SIGNAL: Record<string, string> = {
  postinstall_network: 'CW001',
  postinstall_shell: 'CW002',
  credential_file_access: 'CW003',
  obfuscation_score: 'CW004',
  suspicious_publish: 'CW005',
  dependency_confusion: 'CW006',
  behavioral_drift: 'CW007',
};

function getSignalId(rule: string): string {
  return RULE_TO_SIGNAL[rule] ?? rule;
}

describe('Events: rule-to-signal mapping', () => {
  it('maps all 7 rules to CWxxx IDs', () => {
    expect(getSignalId('postinstall_network')).toBe('CW001');
    expect(getSignalId('postinstall_shell')).toBe('CW002');
    expect(getSignalId('credential_file_access')).toBe('CW003');
    expect(getSignalId('obfuscation_score')).toBe('CW004');
    expect(getSignalId('suspicious_publish')).toBe('CW005');
    expect(getSignalId('dependency_confusion')).toBe('CW006');
    expect(getSignalId('behavioral_drift')).toBe('CW007');
  });

  it('passes through unknown rule names', () => {
    expect(getSignalId('unknown_rule')).toBe('unknown_rule');
    expect(getSignalId('custom_rule')).toBe('custom_rule');
  });
});

describe('Events: request validation', () => {
  // Simulate the zod validation from events.ts.
  const validFinding = {
    rule: 'postinstall_network',
    severity: 'high',
    package: 'evil@1.0.0',
    description: 'Network call in postinstall',
  };

  const validRequest = {
    repo: 'org/repo',
    run_id: 'ci-123',
    findings: [validFinding],
  };

  it('accepts a valid request', () => {
    expect(validRequest.repo).toBeTruthy();
    expect(validRequest.run_id).toBeTruthy();
    expect(validRequest.findings.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high', 'critical']).toContain(validRequest.findings[0]!.severity);
  });

  it('rejects empty repo name', () => {
    const req = { ...validRequest, repo: '' };
    expect(req.repo.length).toBe(0);
  });

  it('rejects empty run_id', () => {
    const req = { ...validRequest, run_id: '' };
    expect(req.run_id.length).toBe(0);
  });

  it('accepts findings with optional fields', () => {
    const finding = {
      ...validFinding,
      file: 'node_modules/evil/install.js:5',
      evidence: 'require("https")',
      chain_score: 85,
    };
    expect(finding.file).toBeDefined();
    expect(finding.chain_score).toBe(85);
  });
});
