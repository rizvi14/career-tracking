import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const RADIAN = Math.PI / 180;
function PieLabel({ cx, cy, midAngle, outerRadius, name, value, percent }) {
  if (percent < 0.04) return null;
  const radius = outerRadius + 32;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x} y={y}
      fill="#374151"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
    >
      {name} ({value} · {(percent * 100).toFixed(1)}%)
    </text>
  );
}
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { STATUSES } from '../constants';
import { findDuplicateGroups } from '../duplicates';

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function Analytics({ applications }) {
  const stats = useMemo(() => {
    const getTags = (a) => (Array.isArray(a.tags) ? a.tags : [a.status ?? 'Application']);
    const total = applications.length;
    const active = applications.filter(
      (a) => !['Rejected', 'Withdrew', 'Offer'].some((s) => getTags(a).includes(s))
    ).length;
    const inInterview = applications.filter((a) =>
      ['Phone Screen', 'Hiring Manager', 'Presentation', 'Panel', 'Final'].some((s) =>
        getTags(a).includes(s)
      )
    ).length;
    const offers = applications.filter((a) => getTags(a).includes('Offer')).length;

    // Pie chart data — count each tag across all applications
    const statusCounts = STATUSES.map((s) => ({
      name: s.value,
      value: applications.filter((a) => getTags(a).includes(s.value)).length,
      color: s.color,
    })).filter((s) => s.value > 0);
    const statusTotal = statusCounts.reduce((sum, s) => sum + s.value, 0);
    statusCounts.forEach((s) => { s.pct = statusTotal > 0 ? ((s.value / statusTotal) * 100).toFixed(1) : '0.0'; });

    // Cumulative by date
    const byDate = {};
    applications.forEach((a) => {
      if (a.applied_date) byDate[a.applied_date] = (byDate[a.applied_date] || 0) + 1;
    });
    let cumulative = 0;
    const cumulativeData = Object.keys(byDate)
      .sort()
      .map((d) => {
        cumulative += byDate[d];
        return {
          date: new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          daily: byDate[d],
          total: cumulative,
        };
      });

    // Weekly bar chart — group by week start (Monday)
    const weeklyMap = new Map();
    applications.forEach((a) => {
      if (!a.applied_date) return;
      const d = new Date(a.applied_date + 'T00:00:00');
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const key = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const sortKey = monday.toISOString();
      weeklyMap.set(key, { count: (weeklyMap.get(key)?.count || 0) + 1, sortKey });
    });
    const weeklyData = [...weeklyMap.entries()]
      .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
      .map(([week, { count }]) => ({ week, count }));

    const duplicateGroups = findDuplicateGroups(applications);

    // Avg days: Application → Phone Screen (first response was a phone screen)
    const INTERVIEW_STAGES = ['Phone Screen', 'Hiring Manager', 'Presentation', 'Panel', 'Final'];
    const phoneScreenApps = applications.filter(
      (a) => a.applied_date && a.tag_dates?.['Phone Screen']
    );
    const avgToPhoneScreen =
      phoneScreenApps.length > 0
        ? Math.round(
            phoneScreenApps.reduce((sum, a) => {
              const days =
                (new Date(a.tag_dates['Phone Screen'] + 'T00:00:00') -
                  new Date(a.applied_date + 'T00:00:00')) /
                86400000;
              return sum + days;
            }, 0) / phoneScreenApps.length
          )
        : null;

    // Avg days: Application → Rejection (ghosted — no interview stages reached)
    const ghostRejectedApps = applications.filter((a) => {
      const tags = getTags(a);
      return (
        tags.includes('Rejected') &&
        !INTERVIEW_STAGES.some((s) => tags.includes(s)) &&
        a.applied_date &&
        a.tag_dates?.['Rejected']
      );
    });
    const avgToRejection =
      ghostRejectedApps.length > 0
        ? Math.round(
            ghostRejectedApps.reduce((sum, a) => {
              const days =
                (new Date(a.tag_dates['Rejected'] + 'T00:00:00') -
                  new Date(a.applied_date + 'T00:00:00')) /
                86400000;
              return sum + days;
            }, 0) / ghostRejectedApps.length
          )
        : null;

    return {
      total, active, inInterview, offers,
      statusCounts, cumulativeData, weeklyData, duplicateGroups,
      avgToPhoneScreen, phoneScreenCount: phoneScreenApps.length,
      avgToRejection, ghostRejectionCount: ghostRejectedApps.length,
    };
  }, [applications]);

  if (applications.length === 0) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p className="text-base">No data yet — add some applications to see analytics.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Applications" value={stats.total} color="text-gray-900" />
        <StatCard label="Active" value={stats.active} color="text-blue-600" />
        <StatCard label="In Interviews" value={stats.inInterview} color="text-purple-600" />
        <StatCard label="Offers" value={stats.offers} color="text-emerald-600" />
      </div>

      {/* Response time KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Avg. Days to Phone Screen
          </p>
          {stats.avgToPhoneScreen !== null ? (
            <>
              <p className="text-3xl font-bold text-purple-600">{stats.avgToPhoneScreen}d</p>
              <p className="text-xs text-gray-400 mt-1">across {stats.phoneScreenCount} application{stats.phoneScreenCount !== 1 ? 's' : ''} that reached phone screen</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Avg. Days to Rejection (No Interview)
          </p>
          {stats.avgToRejection !== null ? (
            <>
              <p className="text-3xl font-bold text-gray-500">{stats.avgToRejection}d</p>
              <p className="text-xs text-gray-400 mt-1">across {stats.ghostRejectionCount} application{stats.ghostRejectionCount !== 1 ? 's' : ''} rejected before any interview</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status donut */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
              <Tooltip formatter={(val, name, props) => [`${val} (${props.payload.pct}%)`, name]} />
              <Pie
                data={stats.statusCounts}
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                labelLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
                label={PieLabel}
              >
                {stats.statusCounts.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Applications per Week</h3>
          {stats.weeklyData.length === 0 ? (
            <p className="text-sm text-gray-400 pt-8 text-center">No dated applications yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.weeklyData} margin={{ top: 20, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Applications">
                  <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#6B7280' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cumulative over time */}
      {stats.cumulativeData.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Cumulative Applications Over Time
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={stats.cumulativeData}
              margin={{ top: 20, right: 16, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#blueGrad)"
                name="Total"
                dot={{ r: 3, fill: '#3B82F6', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              >
                <LabelList dataKey="total" position="top" style={{ fontSize: 10, fill: '#3B82F6' }} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Quality */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Data Quality</h3>
          {stats.duplicateGroups.length === 0 ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              No issues
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {stats.duplicateGroups.length} potential duplicate{stats.duplicateGroups.length > 1 ? ' groups' : ''}
            </span>
          )}
        </div>

        {stats.duplicateGroups.length === 0 ? (
          <p className="text-sm text-gray-400">All entries look clean.</p>
        ) : (
          <div className="space-y-3">
            {stats.duplicateGroups.map((group, gi) => (
              <div key={gi} className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wider mb-2">
                  Duplicate group {gi + 1}
                </p>
                <div className="space-y-1.5">
                  {group.map((app) => {
                    const tags = Array.isArray(app.tags) ? app.tags : [app.status ?? 'Application'];
                    const appliedFmt = app.applied_date
                      ? new Date(app.applied_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : null;
                    return (
                      <div key={app.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-gray-800 truncate">{app.company}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-600 truncate">{app.title}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4 text-xs text-gray-400">
                          {appliedFmt && <span>{appliedFmt}</span>}
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
                          >
                            {tags[tags.length - 1]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
