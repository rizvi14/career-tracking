// In the packaged desktop app the frontend is served by the FastAPI backend
// itself, so API calls are same-origin and BASE is empty (relative). In dev,
// Vite serves the UI on :5173 and we call the backend on :8000 directly — the
// backend's CORS config already allows this origin.
const BASE = import.meta.env.DEV ? 'http://localhost:8000' : '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  parseText: (text) =>
    request('/api/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),

  getApplications: () => request('/api/applications'),

  createApplication: (data) =>
    request('/api/applications', { method: 'POST', body: JSON.stringify(data) }),

  updateApplication: (id, data) =>
    request(`/api/applications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteApplication: (id) =>
    request(`/api/applications/${id}`, { method: 'DELETE' }),

  bulkUpdate: (ids, field, value) =>
    request('/api/applications/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, field, value }),
    }),

  getUndoStatus: () => request('/api/undo/status'),

  undo: () => request('/api/undo', { method: 'POST' }),
};
