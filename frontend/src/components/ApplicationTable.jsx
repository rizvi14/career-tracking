import { useState } from 'react';
import { STATUSES, STATUS_MAP } from '../constants';
import { Pencil, Trash2, ExternalLink, Search, FileText, AlertTriangle, CalendarDays, X } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { findDuplicateIds } from '../duplicates';

const TERMINAL_TAGS = ['Rejected', 'Withdrew', 'Position Filled', 'Role Cancelled'];

const BULK_FIELDS = [
  { label: 'Date Applied', value: 'applied_date' },
];

function daysSinceLastUpdate(app) {
  const tags = Array.isArray(app.tags) ? app.tags : [app.status ?? 'Application'];
  if (TERMINAL_TAGS.some((t) => tags.includes(t))) return null;
  const tagDates = app.tag_dates && typeof app.tag_dates === 'object' ? app.tag_dates : {};
  const dates = Object.values(tagDates).filter(Boolean);
  if (app.applied_date) dates.push(app.applied_date);
  if (dates.length === 0) return null;
  const latest = dates.slice().sort().at(-1);
  return Math.floor((new Date() - new Date(latest + 'T00:00:00')) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ApplicationTable({ applications, onEdit, onDelete, onBulkUpdate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState(new Set());
  const [bulkField, setBulkField] = useState('applied_date');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const getTags = (app) => (Array.isArray(app.tags) ? app.tags : [app.status ?? 'Application']);
  const getTagDates = (app) => (app.tag_dates && typeof app.tag_dates === 'object' ? app.tag_dates : {});
  const duplicateIds = findDuplicateIds(applications);

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const filtered = applications
    .filter((app) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        app.company.toLowerCase().includes(q) ||
        app.title.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'All' || getTags(app).includes(statusFilter);
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const dateA = a.applied_date ?? '';
      const dateB = b.applied_date ?? '';
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      const tsA = a.created_at ?? '';
      const tsB = b.created_at ?? '';
      return tsB.localeCompare(tsA);
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (!bulkDate || selected.size === 0) return;
    setBulkSaving(true);
    try {
      await onBulkUpdate([...selected], bulkField, bulkDate);
      setSelected(new Set());
      setBulkDate('');
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search company or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              statusFilter === 'All'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All ({applications.length})
          </button>
          {STATUSES.map((s) => {
            const count = applications.filter((a) => getTags(a).includes(s.value)).length;
            if (count === 0) return null;
            return (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  statusFilter === s.value
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s.value} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
          <CalendarDays className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={bulkField}
              onChange={(e) => setBulkField(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {BULK_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <button
              onClick={applyBulk}
              disabled={!bulkDate || bulkSaving}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {bulkSaving ? 'Saving…' : 'Apply'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
          {applications.length === 0
            ? 'No applications yet. Hit "Add Application" to get started.'
            : 'No results match your filters.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="pl-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {['Date Applied', 'Company', 'Role', 'Location', 'Salary', 'Status', 'Days Idle', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((app) => {
                const tags = getTags(app);
                const tagDates = getTagDates(app);
                const isRejected = TERMINAL_TAGS.some((t) => tags.includes(t));
                const isSelected = selected.has(app.id);
                return (
                <tr
                  key={app.id}
                  onClick={() => onEdit(app)}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/60'
                      : isRejected
                      ? 'bg-gray-50/80 hover:bg-gray-100/80'
                      : 'hover:bg-gray-50/60'
                  }`}
                >
                  <td className="pl-4 py-3.5 w-8" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(app.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className={`px-4 py-3.5 text-sm whitespace-nowrap ${isRejected ? 'text-gray-400' : 'text-gray-500'}`}>
                    {formatDate(app.applied_date)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium ${isRejected ? 'text-gray-400' : 'text-gray-900'}`}>{app.company}</span>
                      {duplicateIds.has(app.id) && (
                        <span title="Possible duplicate — similar company and role already exists" className="text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {app.url && (
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-300 hover:text-blue-500 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {app.cover_letter ? (
                        <span title="Cover letter attached" className="text-emerald-500">
                          <FileText className="w-3 h-3" />
                        </span>
                      ) : (
                        <span title="No cover letter" className="text-gray-200">
                          <FileText className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3.5 text-sm max-w-[200px] truncate ${isRejected ? 'text-gray-400' : 'text-gray-700'}`}>
                    {app.title}
                  </td>
                  <td className={`px-4 py-3.5 text-sm ${isRejected ? 'text-gray-400' : 'text-gray-500'}`}>{app.location || '—'}</td>
                  <td className={`px-4 py-3.5 text-sm max-w-[140px] truncate ${isRejected ? 'text-gray-400' : 'text-gray-500'}`} title={app.salary || undefined}>
                    {app.salary || '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          title={tagDates[tag] ? `Added ${fmtDate(tagDates[tag])}` : undefined}
                        >
                          <StatusBadge status={tag} muted={isRejected} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {(() => {
                      const days = daysSinceLastUpdate(app);
                      if (days === null) return null;
                      const cls =
                        days <= 7  ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        days <= 14 ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                        days <= 30 ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                     'bg-red-50 text-red-700 border-red-100';
                      return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
                          {days}d
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => onEdit(app)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(app.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
