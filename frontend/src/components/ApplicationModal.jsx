import { useState, useEffect } from 'react';
import { api } from '../api';
import { STATUSES } from '../constants';
import { X, Link2, Loader2, AlertCircle, Trash2 } from 'lucide-react';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

const EMPTY = {
  url: '',
  company: '',
  title: '',
  location: '',
  job_type: '',
  salary: '',
  benefits: '',
  description: '',
  cover_letter: '',
  notes: '',
  tags: ['Application'],
  applied_date: today(),
};

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export default function ApplicationModal({ isOpen, onClose, onSave, onDelete, initialData }) {
  const [form, setForm] = useState(EMPTY);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setForm({
        url: initialData.url ?? '',
        company: initialData.company ?? '',
        title: initialData.title ?? '',
        location: initialData.location ?? '',
        job_type: initialData.job_type ?? '',
        salary: initialData.salary ?? '',
        benefits: initialData.benefits ?? '',
        description: initialData.description ?? '',
        cover_letter: initialData.cover_letter ?? '',
        notes: initialData.notes ?? '',
        tags: initialData.tags ?? [initialData.status ?? 'Application'],
        applied_date: initialData.applied_date ?? today(),
      });
    } else {
      setForm({ ...EMPTY, applied_date: today() });
    }
    setParseError('');
    setPasteMode(false);
    setPasteText('');
  }, [initialData, isOpen]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const toggleTag = (tag) => {
    setForm((prev) => {
      const has = prev.tags.includes(tag);
      const next = has ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag];
      return { ...prev, tags: next.length === 0 ? prev.tags : next };
    });
  };

  const applyParsedData = (data) => {
    const anyFilled = data.company || data.title || data.description || data.location;
    if (!anyFilled) {
      setParseError('Could not extract job info — the page may require a login or block scrapers. Try pasting the job text instead.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      company: data.company || prev.company,
      title: data.title || prev.title,
      location: data.location || prev.location,
      job_type: data.job_type || prev.job_type,
      salary: data.salary || prev.salary,
      benefits: data.benefits || prev.benefits,
      description: data.description || prev.description,
    }));
  };

  const handleParse = async () => {
    if (pasteMode) {
      if (!pasteText.trim()) return;
      setParsing(true);
      setParseError('');
      try {
        const data = await api.parseText(pasteText.trim());
        applyParsedData(data);
      } catch (e) {
        setParseError(e.message || 'Failed to parse pasted text.');
      } finally {
        setParsing(false);
      }
    } else {
      if (!form.url.trim()) return;
      setParsing(true);
      setParseError('');
      try {
        const data = await api.parseUrl(form.url.trim());
        applyParsedData(data);
      } catch (e) {
        setParseError(e.message || 'Failed to parse URL. You can fill in the fields manually.');
      } finally {
        setParsing(false);
      }
    }
  };

  const handleSave = async () => {
    if (!form.company.trim() || !form.title.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {initialData ? 'Edit Application' : 'New Application'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* URL parser */}
          <Field label="Job Posting">
            <div className="flex gap-2">
              {pasteMode ? (
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={4}
                  placeholder="Paste job text (select-all from the job page) or raw page source (right-click → View Page Source, then Ctrl+A, Ctrl+C)…"
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
                />
              ) : (
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url"
                    value={form.url}
                    onChange={set('url')}
                    onKeyDown={(e) => e.key === 'Enter' && handleParse()}
                    placeholder="https://..."
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleParse}
                disabled={parsing || (pasteMode ? !pasteText.trim() : !form.url.trim())}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {parsing && <Loader2 className="w-4 h-4 animate-spin" />}
                {parsing ? 'Parsing…' : 'Parse Job'}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setPasteMode((v) => !v); setParseError(''); }}
                className="text-xs text-blue-600 hover:underline"
              >
                {pasteMode ? '← Back to URL' : 'Page not parsing? Paste page source instead'}
              </button>
            </div>
            {parseError && (
              <p className="mt-1.5 flex items-start gap-1.5 text-red-600 text-xs">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {parseError}
              </p>
            )}
          </Field>

          <div className="border-t border-gray-100" />

          {/* Company + Title */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company" required>
              <input
                type="text"
                value={form.company}
                onChange={set('company')}
                required
                className={inputCls}
              />
            </Field>
            <Field label="Job Title" required>
              <input
                type="text"
                value={form.title}
                onChange={set('title')}
                required
                className={inputCls}
              />
            </Field>
          </div>

          {/* Location + Job Type + Salary */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Location">
              <input type="text" value={form.location} onChange={set('location')} className={inputCls} />
            </Field>
            <Field label="Job Type">
              <select value={form.job_type} onChange={set('job_type')} className={inputCls}>
                <option value="">Select…</option>
                {['Full-time', 'Part-time', 'Contract', 'Remote', 'Hybrid'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Salary">
              <input
                type="text"
                value={form.salary}
                onChange={set('salary')}
                placeholder="e.g. $80k–$100k"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Tags + Date */}
          {(() => {
            const tagDates = initialData?.tag_dates ?? {};
            const history = Object.entries(tagDates)
              .sort(([, a], [, b]) => a.localeCompare(b))
              .map(([tag, d]) => ({ tag, date: d }));
            const fmtShort = (iso) =>
              new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Field label="Tags">
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {STATUSES.map((s) => {
                        const active = form.tags.includes(s.value);
                        const addedDate = tagDates[s.value];
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => toggleTag(s.value)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                            style={
                              active
                                ? { backgroundColor: s.color + '22', color: s.color, borderColor: s.color + '70' }
                                : { backgroundColor: 'white', color: '#9CA3AF', borderColor: '#E5E7EB' }
                            }
                          >
                            {s.value}
                            {active && addedDate && (
                              <span className="opacity-60">{fmtShort(addedDate)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  {history.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5">History</p>
                      <div className="space-y-1">
                        {history.map(({ tag, date: d }) => {
                          const s = STATUSES.find((x) => x.value === tag);
                          return (
                            <div key={tag} className="flex items-center gap-2 text-xs text-gray-500">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: s?.color ?? '#6B7280' }}
                              />
                              <span className="font-medium" style={{ color: s?.color ?? '#6B7280' }}>{tag}</span>
                              <span className="text-gray-400">{fmtShort(d)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <Field label="Date Applied">
                  <input
                    type="date"
                    value={form.applied_date}
                    onChange={set('applied_date')}
                    className={inputCls}
                  />
                </Field>
              </div>
            );
          })()}

          {/* Description */}
          <Field label="Job Description">
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={7}
              className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
              placeholder="Job description will be auto-filled when parsing a URL…"
            />
          </Field>

          {/* Benefits */}
          <Field label="Benefits">
            <textarea
              value={form.benefits}
              onChange={set('benefits')}
              rows={3}
              className={`${inputCls} resize-y`}
              placeholder="Benefits will be auto-filled when parsing a URL…"
            />
          </Field>

          {/* Cover Letter */}
          <Field label="Cover Letter">
            <textarea
              value={form.cover_letter}
              onChange={set('cover_letter')}
              rows={9}
              className={`${inputCls} resize-y`}
              placeholder="Paste your cover letter here…"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              className={`${inputCls} resize-y`}
              placeholder="Recruiter contact, interview notes, next steps…"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <div>
            {initialData && onDelete && (
              <button
                type="button"
                onClick={async () => {
                  await onDelete(initialData.id);
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.company.trim() || !form.title.trim()}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : initialData ? 'Save Changes' : 'Add Application'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
