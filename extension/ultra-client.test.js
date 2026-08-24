const test = require('node:test');
const assert = require('node:assert/strict');
const { createUltraClient } = require('./shared/ultra-client');

function fakeFetch(expectedBody) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => expectedBody };
  };
  return { calls, fetchImpl };
}

test('creates a run with the selected workspace, workflow, and Auto Coding grant', async () => {
  const fake = fakeFetch({ runId: 'run-1', state: { status: 'running' } });
  const client = createUltraClient({ server: 'http://localhost:5747', token: 'secret', fetchImpl: fake.fetchImpl });
  const result = await client.createRun({ task: 'add tests', cwd: 'C:\\workspace', workflowId: 'coding' });

  assert.deepEqual(result, { runId: 'run-1', state: { status: 'running' } });
  assert.equal(fake.calls[0].url, 'http://localhost:5747/ultra/runs');
  assert.equal(fake.calls[0].options.headers['X-Agent-Token'], 'secret');
  assert.deepEqual(JSON.parse(fake.calls[0].options.body), { task: 'add tests', cwd: 'C:\\workspace', workflowId: 'coding', autoCoding: true });
});

test('sends pause and stop to the selected run', async () => {
  const fake = fakeFetch({ runId: 'run-1', state: { status: 'paused' } });
  const client = createUltraClient({ server: 'http://localhost:5747/', token: 'secret', fetchImpl: fake.fetchImpl });

  await client.pause('run-1');
  await client.stop('run-1', 'user stop');
  assert.equal(fake.calls[0].url, 'http://localhost:5747/ultra/runs/run-1/pause');
  assert.equal(fake.calls[1].url, 'http://localhost:5747/ultra/runs/run-1/stop');
  assert.deepEqual(JSON.parse(fake.calls[1].options.body), { reason: 'user stop' });
});
