const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

const TOKEN = 'chatgpt-agent-local-v1';
let server;
let origin;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', 'x-agent-token': TOKEN, ...(options.headers || {}) };
  const response = await fetch(origin + path, { ...options, headers });
  return { response, body: await response.json() };
}

test('creates an authenticated Auto Coding run with a bounded workflow', async () => {
  const created = await request('/ultra/runs', {
    method: 'POST',
    body: JSON.stringify({ task: 'add a health check', cwd: process.cwd(), workflowId: 'coding', autoCoding: true, limits: { maxSteps: 8, maxCommands: 12, maxMinutes: 5, maxRetries: 1 } }),
  });
  assert.equal(created.response.status, 202);
  assert.match(created.body.runId, /^[a-f0-9-]{36}$/);
  assert.equal(created.body.state.status, 'running');
  assert.equal(created.body.state.steps[0].role, 'planner');
  assert.equal(created.body.state.guard.limits.maxSteps, 8);
});

test('rejects a write workflow without the explicit Auto Coding grant', async () => {
  const rejected = await request('/ultra/runs', {
    method: 'POST',
    body: JSON.stringify({ task: 'write code', cwd: process.cwd(), workflowId: 'coding', autoCoding: false }),
  });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.error, 'auto_coding_required');
});

test('pause, resume, advance, and stop update only the selected run', async () => {
  const created = await request('/ultra/runs', {
    method: 'POST',
    body: JSON.stringify({ task: 'run controls', cwd: process.cwd(), workflowId: 'coding', autoCoding: true }),
  });
  const id = created.body.runId;
  const paused = await request(`/ultra/runs/${id}/pause`, { method: 'POST', body: '{}' });
  assert.equal(paused.response.status, 200);
  assert.equal(paused.body.state.status, 'paused');
  const resumed = await request(`/ultra/runs/${id}/resume`, { method: 'POST', body: '{}' });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.body.state.status, 'running');
  const advanced = await request(`/ultra/runs/${id}/advance`, { method: 'POST', body: JSON.stringify({ result: { ok: true, summary: 'planned' } }) });
  assert.equal(advanced.response.status, 200);
  assert.equal(advanced.body.state.currentStep.id, 'implement');
  assert.equal(advanced.body.state.steps[0].status, 'completed');
  const stopped = await request(`/ultra/runs/${id}/stop`, { method: 'POST', body: JSON.stringify({ reason: 'manual stop' }) });
  assert.equal(stopped.response.status, 200);
  assert.equal(stopped.body.state.status, 'stopped');
});

test('ultra run mutations require the agent token', async () => {
  const response = await fetch(origin + '/ultra/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task: 'denied', cwd: process.cwd(), workflowId: 'coding', autoCoding: true }) });
  assert.equal(response.status, 401);
});

test('legacy command execution rejects a cwd outside the configured workspace', async () => {
  const rejected = await request('/tools/run_powershell/execute', {
    method: 'POST',
    body: JSON.stringify({ input: { cwd: require('node:path').dirname(process.cwd()), command: 'Write-Output outside' } }),
  });
  assert.equal(rejected.response.status, 400);
  assert.match(rejected.body.error, /outside|workspace|cwd/i);
});

test('legacy terminal tools reject destructive or publishing commands before execution', async () => {
  const rejected = await request('/tools/run_powershell/execute', {
    method: 'POST',
    body: JSON.stringify({ input: { cwd: process.cwd(), command: 'git push origin main' } }),
  });
  assert.equal(rejected.response.status, 400);
  assert.match(rejected.body.error, /denied|policy/i);
});

test('the direct exec endpoint uses the same command policy', async () => {
  const rejected = await request('/exec', {
    method: 'POST',
    body: JSON.stringify({ cwd: process.cwd(), command: 'Remove-Item -Recurse -Force .', requestId: 'policy-test' }),
  });
  assert.equal(rejected.response.status, 400);
  assert.match(rejected.body.error, /denied|policy/i);
});

test('an Ultra role cannot use a tool outside its current capability set', async () => {
  const created = await request('/ultra/runs', {
    method: 'POST',
    body: JSON.stringify({ task: 'role boundary', cwd: process.cwd(), workflowId: 'coding', autoCoding: true }),
  });
  const rejected = await request('/tools/run_powershell/execute', {
    method: 'POST',
    body: JSON.stringify({ ultraRunId: created.body.runId, ultraRole: 'planner', input: { cwd: process.cwd(), command: 'Write-Output planner-must-not-run-terminal' } }),
  });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.code, 'role_capability_denied');
});
