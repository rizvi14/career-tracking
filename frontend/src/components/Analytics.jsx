import { useMemo, useState } from 'react';
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

// Canonical progression ladder, shared by the stat cards and the funnel so both
// treat advancement the same way. `furthest` returns an app's most-advanced rung
// (>= 0 index), or -1 if it never entered the ladder. Because Offer/Offer Accepted
// rank above Final, an app that reached an offer counts as having passed Final.
const LADDER = ['Phone Screen', 'Hiring Manager', 'Technical', 'Presentation', 'Panel', 'Final', 'Offer', 'Offer Accepted'];
const furthest = (a) => (Array.isArray(a.tags) ? a.tags : [a.status ?? 'Application']).reduce((m, t) => Math.max(m, LADDER.indexOf(t)), -1);

// A filled path that connects a vertical band on the left to one on the right,
// with smooth cubic edges — the classic Sankey ribbon.
function ribbonPath(x0, y0t, y0b, x1, y1t, y1b) {
  const cx = (x0 + x1) / 2;
  return `M${x0},${y0t} C${cx},${y0t} ${cx},${y1t} ${x1},${y1t} L${x1},${y1b} C${cx},${y1b} ${cx},${y0b} ${x0},${y0b} Z`;
}

// The Grind — a true dense Sankey. The pipeline runs along a top baseline; at every
// stage the apps that don't advance peel off downward into labeled exit nodes
// (rejections / no-response). Ribbon thickness is proportional to volume, so the
// brutal first cut reads as one fat flow and the survivors thread through to the offer.
function GrindSankey({ stages, noResponse, closedNoInterview, acceptedCompany }) {
  const [hover, setHover] = useState(null); // hovered stage index
  const VB_W = 1000;
  const VB_H = 470;
  const padL = 60;
  const padR = 132;
  const top = 58;
  const nodeW = 18;
  const n = stages.length;
  const colGap = (VB_W - padL - padR - nodeW) / (n - 1);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const maxH = 176;
  const minH = 9;
  const scale = (c) => Math.max(minH, (maxH * c) / maxCount);

  const S = stages.map((s, i) => {
    const h = scale(s.count);
    const x = padL + i * colGap;
    return { ...s, x, cx: x + nodeW / 2, h, top, bottom: top + h };
  });

  // Exit (drop-off) nodes per gap, stacked in a lower band.
  const REJ = '#FB7185'; // rose
  const GHOST = '#94A3B8'; // slate
  const exitTop = top + maxH + 46;
  const exits = [];
  for (let i = 0; i < n - 1; i++) {
    const drop = stages[i].count - stages[i + 1].count;
    if (drop <= 0) continue;
    let list;
    if (i === 0) {
      list = [
        { label: 'No response', count: noResponse, color: GHOST },
        { label: 'Rejected', count: closedNoInterview, color: REJ },
      ].filter((e) => e.count > 0);
    } else if (i === n - 2) {
      list = [{ label: 'Declined / other', count: drop, color: GHOST }];
    } else {
      list = [{ label: 'Rejected', count: drop, color: REJ }];
    }
    // place this gap's exit stack at the mid-point between the two stages
    const ex = S[i].x + nodeW + (colGap - nodeW) * 0.42;
    let stackY = exitTop;
    list.forEach((e, k) => {
      const h = scale(e.count);
      exits.push({ ...e, gap: i, x: ex, h, top: stackY, bottom: stackY + h, key: `${i}-${k}` });
      stackY += h + 12;
    });
  }

  const dimGap = (i) => hover !== null && hover !== i && hover !== i + 1;

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: 'block', height: 'auto' }}>
      <defs>
        {S.map((s, i) => (
          <linearGradient key={`ng-${i}`} id={`gsNode-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={1} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.72} />
          </linearGradient>
        ))}
        {S.slice(0, -1).map((s, i) => (
          <linearGradient key={`ag-${i}`} id={`gsAdv-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={s.color} />
            <stop offset="100%" stopColor={S[i + 1].color} />
          </linearGradient>
        ))}
      </defs>

      {/* Ribbons: advancing flow (top band) + rejection flows (peeling off below) */}
      {S.slice(0, -1).map((s, i) => {
        const adv = S[i + 1];
        const x0 = s.x + nodeW;
        const advBot = top + adv.h; // advancing band is top-aligned, height == next stage
        const active = !dimGap(i);
        // rejection sub-bands start right below the advancing band on the source edge
        let srcY = advBot;
        const gapExits = exits.filter((e) => e.gap === i);
        return (
          <g key={`flows-${i}`}>
            <path
              d={ribbonPath(x0, top, advBot, adv.x, top, top + adv.h)}
              fill={`url(#gsAdv-${i})`}
              fillOpacity={active ? 0.85 : 0.3}
              style={{ transition: 'fill-opacity 0.2s' }}
            />
            {gapExits.map((e) => {
              const path = ribbonPath(x0, srcY, srcY + e.h, e.x, e.top, e.bottom);
              srcY += e.h;
              return (
                <path
                  key={`rej-${e.key}`}
                  d={path}
                  fill={e.color}
                  fillOpacity={hover === null || hover === i ? 0.5 : 0.18}
                  style={{ transition: 'fill-opacity 0.2s' }}
                />
              );
            })}
          </g>
        );
      })}

      {/* Exit nodes + labels */}
      {exits.map((e) => (
        <g key={`exit-${e.key}`} opacity={hover === null || hover === e.gap ? 1 : 0.45} style={{ transition: 'opacity 0.2s' }}>
          <rect x={e.x} y={e.top} width={nodeW} height={e.h} rx={4} fill={e.color} />
          <text x={e.x + nodeW + 8} y={e.top + e.h / 2} dominantBaseline="middle" fontSize={11}>
            <tspan fontWeight={700} fill="#475569">{e.count.toLocaleString()}</tspan>
            <tspan dx={5} fill="#94A3B8">{e.label}</tspan>
          </text>
        </g>
      ))}

      {/* Stage nodes + labels */}
      {S.map((s, i) => {
        const dim = hover !== null && hover !== i;
        return (
          <g
            key={`stage-${i}`}
            opacity={dim ? 0.6 : 1}
            style={{ transition: 'opacity 0.2s', cursor: 'default' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {s.win && <rect x={s.x - 5} y={s.top - 5} width={nodeW + 10} height={s.h + 10} rx={7} fill={s.color} fillOpacity={0.18} />}
            <rect x={s.x} y={s.top} width={nodeW} height={s.h} rx={4} fill={`url(#gsNode-${i})`} />
            <text x={s.cx} y={s.top - 22} textAnchor="middle" fontSize={11.5} fontWeight={s.win ? 700 : 600} fill={s.color}>
              {s.win ? `${acceptedCompany ?? 'Accepted'} 🎉` : s.label}
            </text>
            <text x={s.cx} y={s.top - 8} textAnchor="middle" fontSize={13} fontWeight={800} fill="#1F2937">
              {s.count.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StatCard({ label, value, color, items, popupLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 relative"
      onMouseEnter={() => items && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {open && items && items.length > 0 && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[260px]">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{popupLabel ?? 'Applications'}</p>
          <div className="space-y-2">
            {items.map((app) => (
              <div key={app.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 block truncate">{app.company}</span>
                  <span className="text-xs text-gray-400 block truncate">{app.title}</span>
                </div>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0"
                  style={{ backgroundColor: app.latestStageColor + '1a', color: app.latestStageColor, borderColor: app.latestStageColor + '40' }}
                >
                  {app.latestStage}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Analytics({ applications }) {
  const stats = useMemo(() => {
    const getTags = (a) => (Array.isArray(a.tags) ? a.tags : [a.status ?? 'Application']);
    const total = applications.length;
    const active = applications.filter(
      (a) => !['Rejected', 'Withdrew', 'Offer', 'Offer Accepted', 'Role Cancelled'].some((s) => getTags(a).includes(s))
    ).length;
    const TERMINAL = ['Rejected', 'Withdrew', 'Position Filled', 'Role Cancelled', 'Offer Accepted'];
    const INTERVIEW_STAGE_ORDER = ['Final', 'Panel', 'Presentation', 'Technical', 'Hiring Manager', 'Phone Screen'];
    const inInterviewApps = applications.filter((a) => {
      const tags = getTags(a);
      return (
        !TERMINAL.some((t) => tags.includes(t)) &&
        INTERVIEW_STAGE_ORDER.some((s) => tags.includes(s))
      );
    }).map((a) => {
      const tags = getTags(a);
      const latestStage = INTERVIEW_STAGE_ORDER.find((s) => tags.includes(s));
      const stageInfo = STATUSES.find((s) => s.value === latestStage);
      return { ...a, latestStage, latestStageColor: stageInfo?.color ?? '#6B7280' };
    });
    const inInterview = inInterviewApps.length;

    // Decorate an app with a badge stage (most advanced tag present) for hover popups
    const STAGE_PRIORITY = ['Offer Accepted', 'Offer', ...INTERVIEW_STAGE_ORDER, 'Position Filled', 'Role Cancelled', 'Rejected', 'Withdrew'];
    const decorate = (a) => {
      const tags = getTags(a);
      const latestStage = STAGE_PRIORITY.find((s) => tags.includes(s)) ?? tags[tags.length - 1];
      const stageInfo = STATUSES.find((s) => s.value === latestStage);
      return { ...a, latestStage, latestStageColor: stageInfo?.color ?? '#6B7280' };
    };

    // Cumulative "reached Final or beyond" — matches the funnel's Final Round node,
    // so an app that advanced straight to an Offer still counts here.
    const finalRoundApps = applications.filter((a) => furthest(a) >= LADDER.indexOf('Final')).map(decorate);
    const finalRound = finalRoundApps.length;
    const phoneScreenStageApps = applications.filter((a) => getTags(a).includes('Phone Screen')).map(decorate);
    const phoneScreens = phoneScreenStageApps.length;
    const offerApps = applications.filter((a) => getTags(a).some((t) => t === 'Offer' || t === 'Offer Accepted')).map(decorate);
    const offers = offerApps.length;
    const acceptedApps = applications.filter((a) => getTags(a).includes('Offer Accepted')).map(decorate);
    const accepted = acceptedApps.length;

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

    const phoneScreenRatio = total > 0
      ? ((phoneScreenApps.length / total) * 100).toFixed(1)
      : null;

    return {
      total, active, phoneScreens, phoneScreenStageApps, inInterview, inInterviewApps,
      finalRound, finalRoundApps, offers, offerApps, accepted, acceptedApps,
      phoneScreenRatio, phoneScreenCount: phoneScreenApps.length, phoneScreenRateApps: phoneScreenApps.map(decorate),
      statusCounts, cumulativeData, weeklyData, duplicateGroups,
      avgToPhoneScreen, phoneScreenCount: phoneScreenApps.length,
      avgToRejection, ghostRejectionCount: ghostRejectedApps.length,
    };
  }, [applications]);

  const { funnelStages, noResponse, closedNoInterview, acceptedCompany } = useMemo(() => {
    const getTags = (a) => (Array.isArray(a.tags) ? a.tags : [a.status ?? 'Application']);
    const TERMINAL = ['Rejected', 'Withdrew', 'Position Filled', 'Role Cancelled'];
    const reached = (threshold) => applications.filter((a) => furthest(a) >= threshold).length;

    const acceptedCompany = applications.find((a) => getTags(a).includes('Offer Accepted'))?.company ?? null;

    // Advancing stages, left → right. Each `reached(idx)` = apps whose furthest
    // ladder stage is at least that index (so non-linear paths still count).
    const stages = [
      { label: 'Applications', count: applications.length, color: '#3B82F6' },
      { label: 'Phone Screen', count: reached(0),          color: '#8B5CF6' },
      { label: 'Interviewing', count: reached(1),          color: '#06B6D4' },
      { label: 'Final Round',  count: reached(5),          color: '#EC4899' },
      { label: 'Offer',        count: reached(6),          color: '#10B981' },
      { label: 'Accepted',     count: reached(7),          color: '#047857', win: true },
    ];

    // Split the first (huge) drop into "never heard back" vs "explicitly closed".
    const neverAdvanced = applications.filter((a) => furthest(a) < 0);
    const closedNoInterview = neverAdvanced.filter((a) => getTags(a).some((t) => TERMINAL.includes(t))).length;
    const noResponse = neverAdvanced.length - closedNoInterview;

    return { funnelStages: stages, noResponse, closedNoInterview, acceptedCompany };
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
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-4 mb-4">
        <StatCard label="Total Applications" value={stats.total} color="text-gray-900" />
        <StatCard label="Phone Screens" value={stats.phoneScreens} color="text-blue-600" items={stats.phoneScreenStageApps} popupLabel="Reached phone screen" />
        <StatCard label="In Interviews" value={stats.inInterview} color="text-purple-600" items={stats.inInterviewApps} popupLabel="Active interviews" />
        <StatCard label="Final Round" value={stats.finalRound} color="text-pink-600" items={stats.finalRoundApps} popupLabel="Final round" />
        <StatCard label="Offers" value={stats.offers} color="text-emerald-600" items={stats.offerApps} popupLabel="Offers" />
        <StatCard label="Accepted" value={stats.accepted} color="text-emerald-700" items={stats.acceptedApps} popupLabel="Offer accepted" />
        <StatCard
          label="Phone Screen Rate"
          value={stats.phoneScreenRatio !== null ? `${stats.phoneScreenRatio}%` : '—'}
          color="text-violet-600"
          items={stats.phoneScreenRateApps}
          popupLabel="Reached phone screen"
        />
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

      {/* The Grind — application Sankey */}
      {funnelStages[0].count > 0 && (
        <div className="mt-6 bg-gradient-to-br from-white to-gray-50/60 rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">The Grind → Offer</h3>
          <p className="text-xs text-gray-400 mb-2">
            Every application flowing down to the {acceptedCompany ?? 'final'} offer — and everything lost along the way.
          </p>
          <GrindSankey
            stages={funnelStages}
            noResponse={noResponse}
            closedNoInterview={closedNoInterview}
            acceptedCompany={acceptedCompany}
          />
        </div>
      )}
    </div>
  );
}
