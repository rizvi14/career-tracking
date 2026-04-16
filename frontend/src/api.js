const BASE = 'http://localhost:8000';

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
  parseUrl: (url) =>
    request('/api/parse-url', { method: 'POST', body: JSON.stringify({ url }) }),

  parseText: (text) =>
    request('/api/parse-text', { method: 'POST', body: JSON.stringify({ text }) }),

  getApplications: () => request('/api/applications'),

  createApplication: (data) =>
    request('/api/applications', { method: 'POST', body: JSON.stringify(data) }),

  updateApplication: (id, data) =>
    request(`/api/applications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteApplication: (id) =>
    request(`/api/applications/${id}`, { method: 'DELETE' }),
};
