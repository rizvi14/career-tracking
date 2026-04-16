import { useState } from 'react';
import { STATUSES, STATUS_MAP } from '../constants';
import { Pencil, Trash2, ExternalLink, Search, FileText, AlertTriangle } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { findDuplicateIds } from '../duplicates';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ApplicationTable({ applications, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const getTags = (app) => (Array.isArray(app.tags) ? app.tags : [app.status ?? 'Application']);
  const getTagDates = (app) => (app.tag_dates && typeof app.tag_dates === 'object' ? app.tag_dates : {});
  const duplicateIds = findDuplicateIds(applications);

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const filtered = applications.filter((app) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      app.company.toLowerCase().includes(q) ||
      app.title.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || getTags(app).includes(statusFilter);
    return matchesSearch && matchesStatus;
  });

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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
          {applications.length === 0
            ? 'No applications yet. Hit "Add Application" to get started.'
            : 'No results match your filters.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                {['Date Applied', 'Company', 'Role', 'Location', 'Salary', 'Status', ''].map((h) => (
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
                const isRejected = tags.includes('Rejected') || tags.includes('Withdrew');
                return (
                <tr
                  key={app.id}
                  onClick={() => onEdit(app)}
                  className={`transition-colors cursor-pointer ${
                    isRejected
                      ? 'bg-gray-50/80 hover:bg-gray-100/80'
                      : 'hover:bg-gray-50/60'
                  }`}
                >
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
                  <td className={`px-4 py-3.5 text-sm whitespace-nowrap ${isRejected ? 'text-gray-400' : 'text-gray-500'}`}>
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
      )}
    </div>
  );
}
