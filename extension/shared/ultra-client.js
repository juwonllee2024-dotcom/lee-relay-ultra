(function attachUltraClient(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { createUltraClient: factory };
  else root.createUltraClient = factory;
})(typeof globalThis === 'object' ? globalThis : this, function createUltraClient({ server, token, fetchImpl = fetch } = {}) {
  const base = String(server || '').replace(/\/+$/, '');

  async function request(path, options = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': token,
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || body.error || `Ultra request failed: ${response.status}`);
      error.code = body.error || 'ultra_request_failed';
      error.status = response.status;
      throw error;
    }
    return body;
  }

  return Object.freeze({
    createRun: (input) => request('/ultra/runs', { method: 'POST', body: JSON.stringify({ ...input, autoCoding: true }) }),
    getRun: (runId) => request(`/ultra/runs/${encodeURIComponent(runId)}`),
    pause: (runId) => request(`/ultra/runs/${encodeURIComponent(runId)}/pause`, { method: 'POST', body: '{}' }),
    resume: (runId) => request(`/ultra/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST', body: '{}' }),
    stop: (runId, reason = 'user_stopped') => request(`/ultra/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST', body: JSON.stringify({ reason }) }),
    advance: (runId, result) => request(`/ultra/runs/${encodeURIComponent(runId)}/advance`, { method: 'POST', body: JSON.stringify({ result }) }),
    roles: () => request('/ultra/roles'),
    workflows: () => request('/ultra/workflows'),
  });
});
