const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const app = require('../server');

let server;
let origin;
let tempProject;

test.before(async () => {
  tempProject = await fs.mkdtemp(path.join(process.cwd(), 'lee-relay-ultra-integration-'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => { await new Promise((resolve) => server.close(resolve)); await fs.rm(tempProject, { recursive: true, force: true }); });

async function request(path, options) {
  const response = await fetch(origin + path, options);
  const body = await response.json();
  return { response, body };
}

async function waitForCommand(commandId, terminal = ['completed', 'failed', 'cancelled', 'rejected']) {
  const result = await request(`/commands/${commandId}/wait?timeout=10000`, { headers: { 'x-agent-token': 'chatgpt-agent-local-v1' } });
  assert.equal(result.response.status, 200);
  assert.ok(terminal.includes(result.body.status) || result.body.waitTimedOut);
  return result.body;
}

test('health exposes a local server', async () => {
  const { response, body } = await request('/health');
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test('Ultra health exposes the Browse Code loop release version', async () => {
  const { response, body } = await request('/ultra/health');
  assert.equal(response.status, 200);
  assert.equal(body.product, 'lee-relay-ultra');
  assert.equal(body.version, '1.1.0');
});

test('execution requires the agent token', async () => {
  const { response } = await request('/tools/run_powershell/execute', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { cwd: 'C:\\Windows', command: 'Write-Output denied' } }),
  });
  assert.equal(response.status, 401);
});

test('PowerShell execution records cwd, result, and timing', async () => {
  const { response, body } = await request('/tools/run_powershell/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ sessionId: 'integration', input: { cwd: tempProject, command: 'Write-Output integration-ok' } }),
  });
  assert.equal(response.status, 202);
  const command = (await request(`/commands/${body.id}/wait?timeout=10000`, { headers: { 'x-agent-token': 'chatgpt-agent-local-v1' } })).body;
  assert.equal(command.status, 'completed');
  assert.equal(command.cwd, tempProject);
  assert.equal(command.success, true);
  assert.equal(command.exitCode, 0);
  assert.match(command.result.stdout, /integration-ok/);
  assert.ok(command.startedAt);
  assert.ok(command.finishedAt);
});

test('project inspection accepts an explicit cwd', async () => {
  const { body } = await request('/tools/inspect_project/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject } }),
  });
  assert.equal(body.tool, 'inspect_project');
  assert.equal(body.cwd, tempProject);
});

test('file tools share cwd and rollback a change', async () => {
  const write = await request('/tools/write_file/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject, path: 'nested/page.txt', content: 'before' } }),
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const written = (await request(`/commands/${write.body.id}`)).body;
  assert.equal(written.status, 'completed');
  assert.equal(await fs.readFile(path.join(tempProject, 'nested/page.txt'), 'utf8'), 'before');
  const edit = await request('/tools/edit_file/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject, path: 'nested/page.txt', oldText: 'before', newText: 'after' } }),
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const edited = (await request(`/commands/${edit.body.id}`)).body;
  assert.equal(edited.status, 'completed');
  assert.equal(await fs.readFile(path.join(tempProject, 'nested/page.txt'), 'utf8'), 'after');
  const diff = await request(`/changes/${edited.result.backupId}/diff`);
  assert.equal(diff.body.changed, true);
  const rollback = await request(`/changes/${edited.result.backupId}/rollback`, { method: 'POST', headers: { 'x-agent-token': 'chatgpt-agent-local-v1' } });
  assert.equal(rollback.response.status, 200);
  assert.equal(await fs.readFile(path.join(tempProject, 'nested/page.txt'), 'utf8'), 'before');
});

test('text tools read, write, export, and download txt files', async () => {
  const write = await request('/tools/write_text_file/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject, path: 'notes.txt', content: '한글 text\nline two' } }),
  });
  const written = await waitForCommand(write.body.id);
  assert.equal(written.status, 'completed');

  const read = await request('/tools/read_text_file/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject, path: 'notes.txt' } }),
  });
  const readResult = await waitForCommand(read.body.id);
  assert.equal(readResult.status, 'completed');
  assert.equal(readResult.result.content, '한글 text\nline two');
  assert.equal(readResult.result.encoding, 'utf8');

  const exported = await request('/tools/export_text_file/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject, filename: 'notes-export.txt', content: readResult.result.content } }),
  });
  const exportCommand = await waitForCommand(exported.body.id);
  assert.equal(exportCommand.status, 'completed');
  assert.equal(exportCommand.result.exported, true);
  const download = await fetch(origin + exportCommand.result.downloadUrl, { headers: { 'x-agent-token': 'chatgpt-agent-local-v1' } });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), '한글 text\nline two');
  await fs.rm(path.join(__dirname, '..', 'data', 'exports', `${exportCommand.result.exportId}.txt`), { force: true });
  await fs.rm(path.join(__dirname, '..', 'data', 'exports', `${exportCommand.result.exportId}.json`), { force: true });
});

test('plugin tools are advertised', async () => {
  const { body } = await request('/tools');
  assert.ok(body.tools.some((tool) => tool.name === 'github_status'));
  assert.ok(body.tools.some((tool) => tool.name === 'github_clone'));
  assert.ok(body.tools.some((tool) => tool.name === 'github_download_repo'));
  assert.ok(body.tools.some((tool) => tool.name === 'docker_version'));
});

test('GitHub download rejects non-GitHub URLs before running git', async () => {
  const submitted = await request('/tools/github_clone/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ input: { cwd: tempProject, repository: 'https://example.com/not-github', destination: 'repo' } }),
  });
  const command = await waitForCommand(submitted.body.id);
  assert.equal(command.status, 'failed');
  assert.match(command.error, /GitHub|repository/i);
});

test('session stop cancels a running command without retrying', async () => {
  const submitted = await request('/tools/run_powershell/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ sessionId: 'stop-test', input: { cwd: tempProject, command: 'Start-Sleep -Seconds 5' } }),
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const stopped = await request('/sessions/stop-test/stop', { method: 'POST', headers: { 'x-agent-token': 'chatgpt-agent-local-v1' } });
  assert.equal(stopped.response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const command = (await request(`/commands/${submitted.body.id}`)).body;
  assert.equal(command.status, 'cancelled');
  assert.equal(command.attempts, 1);
});

test('long output keeps a preview and writes a result file', async () => {
  const submitted = await request('/tools/run_powershell/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-token': 'chatgpt-agent-local-v1' },
    body: JSON.stringify({ sessionId: 'output-test', input: { cwd: tempProject, command: `Write-Output ('x' * 12000)` } }),
  });
  let command = submitted.body;
  for (let i = 0; i < 30 && !['completed', 'failed'].includes(command.status); i++) { await new Promise((resolve) => setTimeout(resolve, 100)); command = (await request(`/commands/${submitted.body.id}`)).body; }
  assert.equal(command.status, 'completed');
  assert.ok(command.result.outputFile);
  assert.ok(command.result.stdout.length <= 20000);
  assert.equal((await fs.stat(command.result.outputFile)).isFile(), true);
  const download = await fetch(origin + `/results/${submitted.body.id}/download`, { headers: { 'x-agent-token': 'chatgpt-agent-local-v1' } });
  assert.equal(download.status, 200);
  assert.match(await download.text(), /x{100}/);
});
