import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type OverviewData } from '../api.js';
import FindingCard from '../components/FindingCard.js';
import TrendChart from '../components/TrendChart.js';

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOverview()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{data.workspace.name}</h1>
        <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-600 uppercase">
          {data.workspace.tier}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Repos Scanned" value={data.stats.repos_scanned} color="blue" />
        <StatCard label="Findings (7d)" value={data.stats.total_findings_7d} color="yellow" />
        <StatCard label="Critical (7d)" value={data.stats.critical_7d} color="red" />
        <StatCard label="High (7d)" value={data.stats.high_7d} color="orange" />
      </div>

      {/* Trend chart */}
      <TrendChart data={data.trend} />

      {/* Recent findings */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Findings</h2>
        {data.recent_findings.length === 0 ? (
          <p className="text-sm text-gray-400">No findings in the last 7 days. ✅</p>
        ) : (
          <div className="space-y-3">
            {data.recent_findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 text-blue-900',
    yellow: 'border-yellow-500 text-yellow-900',
    red: 'border-red-500 text-red-900',
    orange: 'border-orange-500 text-orange-900',
  };
  return (
    <div className={`bg-white rounded-lg border-l-4 p-4 ${colorMap[color] ?? colorMap['blue']!}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
