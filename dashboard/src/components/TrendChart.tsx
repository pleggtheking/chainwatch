import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface TrendData {
  date: string;
  count: number;
}

export default function TrendChart({ data }: { data: TrendData[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Findings Trend (30 days)</h3>
        <p className="text-sm text-gray-400">No data yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Findings Trend (30 days)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#dc2626"
            strokeWidth={2}
            fill="url(#trendGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
