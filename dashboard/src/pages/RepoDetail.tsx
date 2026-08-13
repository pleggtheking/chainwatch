import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type Finding } from '../api.js';
import FindingCard from '../components/FindingCard.js';

interface RepoDetailData {
  repo: { id: string; name: string; created_at: string };
  findings: Finding[];
  signal_breakdown: { signal: string; count: number }[];
}

export default function RepoDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RepoDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getRepoDetail(id)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">← Back to overview</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{data.repo.name}</h1>
      </div>

      {/* Signal breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Signal Breakdown</h3>
        {data.signal_breakdown.length === 0 ? (
          <p className="text-sm text-gray-400">No findings recorded.</p>
        ) : (
          <div className="space-y-2">
            {data.signal_breakdown.map((s) => (
              <div key={s.signal} className="flex items-center justify-between">
                <span className="font-mono text-sm">{s.signal}</span>
                <span className="text-sm font-semibold bg-gray-100 px-2 py-0.5 rounded">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Findings history */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Finding History</h2>
        {data.findings.length === 0 ? (
          <p className="text-sm text-gray-400">No findings for this repo.</p>
        ) : (
          <div className="space-y-3">
            {data.findings.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
