import type { Finding } from '../api.js';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 border-red-500 text-red-900',
  high: 'bg-orange-50 border-orange-500 text-orange-900',
  medium: 'bg-yellow-50 border-yellow-500 text-yellow-900',
  low: 'bg-blue-50 border-blue-500 text-blue-900',
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🛑',
  high: '⚠️',
  medium: '🟡',
  low: 'ℹ️',
};

export default function FindingCard({ finding }: { finding: Finding }) {
  const styles = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES['low']!;
  const emoji = SEVERITY_EMOJI[finding.severity] ?? '⚠️';

  return (
    <div className={`border-l-4 rounded p-4 ${styles}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{emoji}</span>
            <span className="font-semibold uppercase">{finding.severity}</span>
            <span className="text-sm opacity-75">{finding.signal}</span>
          </div>
          <div className="mt-1 text-sm">
            <span className="font-mono">{finding.package}</span>
            {finding.repo_name && <span className="opacity-75"> · {finding.repo_name}</span>}
          </div>
          <p className="mt-2 text-sm">{finding.description}</p>
          {finding.file && (
            <p className="mt-1 text-xs font-mono opacity-60">{finding.file}</p>
          )}
        </div>
        <time className="text-xs opacity-60">
          {new Date(finding.created_at).toLocaleString()}
        </time>
      </div>
    </div>
  );
}
