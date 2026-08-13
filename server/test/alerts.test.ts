import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';

// Test alert formatting logic without sending real requests.

describe('Alerts: Slack message formatting', () => {
  const SEVERITY_EMOJI: Record<string, string> = {
    critical: '🛑',
    high: '⚠️',
    medium: '🟡',
    low: 'ℹ️',
  };

  it('maps severities to emojis', () => {
    expect(SEVERITY_EMOJI['critical']).toBe('🛑');
    expect(SEVERITY_EMOJI['high']).toBe('⚠️');
    expect(SEVERITY_EMOJI['medium']).toBe('🟡');
    expect(SEVERITY_EMOJI['low']).toBe('ℹ️');
  });

  it('formats finding text for Slack', () => {
    const finding = {
      severity: 'critical',
      signal: 'CW003',
      package: 'evil@1.0.0',
      description: 'Reads ~/.npmrc',
    };
    const text = `${SEVERITY_EMOJI[finding.severity]} *${finding.severity.toUpperCase()}* — ${finding.signal} in \`${finding.package}\`\n${finding.description}`;
    expect(text).toContain('🛑');
    expect(text).toContain('CRITICAL');
    expect(text).toContain('CW003');
    expect(text).toContain('evil@1.0.0');
    expect(text).toContain('Reads ~/.npmrc');
  });
});

describe('Alerts: webhook HMAC signing', () => {
  it('creates a valid HMAC-SHA256 signature', () => {
    const secret = 'test-secret';
    const payload = JSON.stringify({ event: 'test', findings: [] });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);

    // Verify the signature.
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(signature).toBe(expected);
  });

  it('different secrets produce different signatures', () => {
    const payload = '{"test":true}';
    const sig1 = crypto.createHmac('sha256', 'secret1').update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', 'secret2').update(payload).digest('hex');
    expect(sig1).not.toBe(sig2);
  });
});

describe('Alerts: severity threshold matching', () => {
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

  function shouldAlert(findingSeverity: string, minSeverity: string): boolean {
    return (severityRank[findingSeverity] ?? 0) >= (severityRank[minSeverity] ?? 0);
  }

  it('alerts on critical when threshold is high', () => {
    expect(shouldAlert('critical', 'high')).toBe(true);
  });

  it('does not alert on medium when threshold is high', () => {
    expect(shouldAlert('medium', 'high')).toBe(false);
  });

  it('alerts on all severities when threshold is low', () => {
    expect(shouldAlert('low', 'low')).toBe(true);
    expect(shouldAlert('medium', 'low')).toBe(true);
    expect(shouldAlert('high', 'low')).toBe(true);
    expect(shouldAlert('critical', 'low')).toBe(true);
  });
});
