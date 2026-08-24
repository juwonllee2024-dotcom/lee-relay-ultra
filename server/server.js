const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'chatgpt-agent-local-v1';
app.use(cors({ origin: (origin, callback) => {
  if (!origin || origin.startsWith('chrome-extension://') || origin === 'https://chatgpt.com' || origin === 'https://chat.openai.com' || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return callback(null, true);
  return callback(new Error('origin not allowed'));
} }));
app.use(express.json({ limit: '10mb' }));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

function requireAgentToken(req, res, next) {
  if (req.get('x-agent-token') !== AGENT_TOKEN) return res.status(401).json({ error: 'invalid agent token' });
  next();
}

const PORT = Number(process.env.PORT || 5747);
const ALLOWED_CWD = path.resolve(process.env.AGENT_CWD || process.cwd());
const MAX_OUTPUT = Number(process.env.AGENT_MAX_OUTPUT || 20000);
const OUTPUT_FILE_THRESHOLD = Number(process.env.AGENT_OUTPUT_FILE_THRESHOLD || 10000);
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 60000);
const RETRY_LIMIT = 2;
const COMMAND_WAIT_MS = TIMEOUT_MS * (RETRY_LIMIT + 1) + 10000;
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
const SKILLS_DIR = path.join(__dirname, 'skills');
const PLUGINS_DIR = path.join(__dirname, 'plugins');
const commands = new Map();
const children = new Map();
const commandStops = new Map();
let sessions = {};
let skills = [];
let plugins = [];

const toolDefinitions = {
  list_directory: { risk: 'low', input: 'path' },
  inspect_project: { risk: 'low', input: 'cwd' },
  verify_project: { risk: 'high', input: 'cwd' },
  read_file: { risk: 'low', input: 'path' },
  read_text_file: { risk: 'low', input: 'path' },
  search_files: { risk: 'low', input: 'query/path' },
  write_file: { risk: 'high', input: 'path/content' },
  write_text_file: { risk: 'high', input: 'path/content' },
  export_text_file: { risk: 'high', input: 'filename/content' },
  edit_file: { risk: 'high', input: 'path/oldText/newText' },
  run_powershell: { risk: 'high', input: 'command' },
  run_tests: { risk: 'high', input: 'command' },
  git_status: { risk: 'low', input: 'none' },
  git_diff: { risk: 'low', input: 'none' },
};

function id() { return crypto.randomUUID(); }
function clip(value) { return String(value || '').slice(0, MAX_OUTPUT); }
function inside(candidate) {
  const resolved = path.resolve(ALLOWED_CWD, candidate || '.');
  return resolved === ALLOWED_CWD || resolved.startsWith(ALLOWED_CWD + path.sep) ? resolved : null;
}
async function safePath(value, mustExist, root = ALLOWED_CWD) {
  if (typeof value !== 'string') throw new Error('path is required');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, value || '.');
  const valid = target === resolvedRoot || target.startsWith(resolvedRoot + path.sep);
  if (!valid) throw new Error('path is outside configured cwd');
  if (mustExist) {
    const real = await fsp.realpath(target);
    if (!(real === resolvedRoot || real.startsWith(resolvedRoot + path.sep))) throw new Error('path is outside configured cwd');
    return real;
  }
  let parent = path.dirname(target);
  while (!(await fsp.access(parent).then(() => true).catch(() => false)) && parent !== resolvedRoot && parent !== path.dirname(parent)) parent = path.dirname(parent);
  const realParent = await fsp.realpath(parent);
  if (!(realParent === resolvedRoot || realParent.startsWith(resolvedRoot + path.sep))) throw new Error('parent is outside configured cwd');
  return target;
}
function textEncoding(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return { encoding: 'utf8', offset: 3 };
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return { encoding: 'utf16le', offset: 2 };
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) return { encoding: 'utf16be', offset: 2 };
  return { encoding: 'utf8', offset: 0 };
}
function decodeText(buffer) {
  const detected = textEncoding(buffer);
  const body = buffer.subarray(detected.offset);
  if (detected.encoding === 'utf16be') return { content: Buffer.from(body).swap16().toString('utf16le'), encoding: detected.encoding };
  return { content: body.toString(detected.encoding), encoding: detected.encoding };
}
function textPath(value, root, mustExist) {
  return safePath(value, mustExist, root).then((resolved) => {
    if (!/\.txt$/i.test(resolved)) throw new Error('text file path must end with .txt');
    return resolved;
  });
}
function saveResultFile(commandId, content) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outputFile = path.join(RESULTS_DIR, `${commandId}.txt`);
  fs.writeFileSync(outputFile, content, 'utf8');
  return outputFile;
}
function exportFileName(value) {
  const requested = String(value || 'export.txt').trim() || 'export.txt';
  const name = path.basename(requested);
  if (name !== requested || name === '.' || name === '..' || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) throw new Error('invalid export filename');
  return /\.txt$/i.test(name) ? name : `${name}.txt`;
}
function safeExportId(value) {
  if (!/^[a-f0-9-]{36}$/i.test(String(value || ''))) throw new Error('invalid export id');
  return String(value);
}
function normalizeGitHubRepository(value) {
  const raw = String(value || '').trim();
  let owner;
  let repo;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    [owner, repo] = raw.split('/');
  } else {
    let parsed;
    try { parsed = new URL(raw); } catch (_) { throw new Error('repository must be owner/name or an HTTPS GitHub URL'); }
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('only HTTPS GitHub repository URLs without embedded credentials are accepted');
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) throw new Error('GitHub URL must be https://github.com/owner/name');
    [owner, repo] = parts;
  }
  repo = repo.replace(/\.git$/i, '');
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('invalid GitHub repository name');
  return { owner, repo, url: `https://github.com/${owner}/${repo}.git` };
}
function powerShellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
async function workingDirectory(value) {
  let requested = String(value || ALLOWED_CWD).trim().replace(/^"|"$/g, '');
  requested = requested.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`);
  if (requested === '~') requested = process.env.USERPROFILE || requested;
  const target = path.resolve(requested);
  const stat = await fsp.stat(target);
  if (!stat.isDirectory()) throw new Error('cwd is not a directory');
  return await fsp.realpath(target);
}
function findPowerShellExe() {
  const candidates = [process.env.SystemRoot && process.env.SystemRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'];
  return candidates.find((p) => p && fs.existsSync(p)) || 'powershell.exe';
}

function runPowerShell(command, cwd, commandId) {
  return new Promise((resolve) => {
    const utf8 = '$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); ';
    const ps = spawn(findPowerShellExe(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', utf8 + command], { cwd, windowsHide: true });
    children.set(commandId, ps);
    let stdout = '', stderr = '', stopped = false;
    const stop = (reason) => { stopped = reason; try { ps.kill(); } catch (_) {} };
    const timer = setTimeout(() => stop('timeout'), TIMEOUT_MS);
    const add = (name, data) => { const text = data.toString(); if (name === 'stdout') stdout += text; else stderr += text; if (stdout.length + stderr.length > MAX_OUTPUT * 2) stop('output_limit'); };
    ps.stdout.on('data', (d) => add('stdout', d)); ps.stderr.on('data', (d) => add('stderr', d));
    ps.on('error', (err) => { clearTimeout(timer); children.delete(commandId); const reason = commandStops.get(commandId) || stopped; commandStops.delete(commandId); resolve(formatProcessResult(commandId, -1, stdout, stderr + '\n' + err.message, reason)); });
    ps.on('close', (code) => { clearTimeout(timer); children.delete(commandId); const reason = commandStops.get(commandId) || stopped; commandStops.delete(commandId); resolve(formatProcessResult(commandId, reason ? -1 : code, stdout, stderr, reason)); });
  });
}
function formatProcessResult(commandId, exitCode, stdout, stderr, stopped) {
  const combined = `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
  let outputFile = null;
  if (combined.length > OUTPUT_FILE_THRESHOLD) {
    try { outputFile = saveResultFile(commandId, combined); } catch (_) {}
  }
  return { exitCode, stdout: clip(stdout), stderr: clip(stderr), stopped, outputFile, outputId: outputFile ? commandId : null };
}
async function loadSessions() {
  try { sessions = JSON.parse(await fsp.readFile(SESSIONS_FILE, 'utf8')); } catch (_) { sessions = {}; }
  for (const session of Object.values(sessions)) {
    session.commands = (session.commands || []).map((entry) => {
      const command = typeof entry === 'string' ? { id: entry, status: 'unknown' } : entry;
      if (['queued', 'running', 'retrying'].includes(command.status)) {
        command.status = 'interrupted';
        command.success = false;
        command.error = 'Server restarted before this command finished';
        command.finishedAt = new Date().toISOString();
      }
      return command;
    });
    for (const entry of session.commands) if (entry.id) commands.set(entry.id, entry);
  }
}
async function saveSessions() { await fsp.mkdir(DATA_DIR, { recursive: true }); await fsp.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2)); }
async function loadSkills() {
  try {
    const entries = await fsp.readdir(SKILLS_DIR, { withFileTypes: true });
    skills = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const content = await fsp.readFile(path.join(SKILLS_DIR, entry.name, 'SKILL.md'), 'utf8');
      const match = content.match(/^---\s*\r?\n(?:[\s\S]*?\r?\n)?description:\s*(.*?)\r?\n---/);
      return { name: entry.name, description: match ? match[1].trim() : '', content };
    }));
    skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch (_) {
    skills = [];
  }
  return skills;
}
async function loadPlugins() {
  const loaded = [];
  try {
    const entries = await fsp.readdir(PLUGINS_DIR, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const pluginDir = path.join(PLUGINS_DIR, entry.name);
      try {
        const metadata = JSON.parse(await fsp.readFile(path.join(pluginDir, 'plugin.json'), 'utf8'));
        if (!metadata || typeof metadata !== 'object' || typeof metadata.name !== 'string') continue;
        const plugin = {
          name: metadata.name,
          version: typeof metadata.version === 'string' ? metadata.version : '',
          description: typeof metadata.description === 'string' ? metadata.description : '',
          tools: [],
        };
        try {
          const definitions = JSON.parse(await fsp.readFile(path.join(pluginDir, 'tools.json'), 'utf8'));
          if (Array.isArray(definitions)) {
            plugin.tools = definitions.filter((tool) => tool && typeof tool.name === 'string' && typeof tool.description === 'string')
              .map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk === 'low' ? 'low' : 'high', input: typeof tool.input === 'string' ? tool.input : 'none' }));
            for (const tool of plugin.tools) if (!toolDefinitions[tool.name]) toolDefinitions[tool.name] = { risk: tool.risk, input: tool.input };
          }
        } catch (_) {
          // tools.json is optional; a missing or invalid file does not disable metadata.
        }
        loaded.push(plugin);
      } catch (_) {
        // Ignore incomplete plugins rather than loading executable or malformed content.
      }
    }
    loaded.sort((a, b) => a.name.localeCompare(b.name));
  } catch (_) {
    // The plugins directory is optional.
  }
  plugins = loaded;
  return loaded;
}
function sessionFor(sessionId) { const sid = sessionId || 'default'; if (!sessions[sid]) sessions[sid] = { id: sid, createdAt: new Date().toISOString(), commands: [] }; return sessions[sid]; }
function recordSessionCommand(command) {
  const session = sessionFor(command.sessionId);
  const summary = publicCommand(command);
  const index = session.commands.findIndex((entry) => entry.id === command.id);
  if (index === -1) session.commands.push(summary); else session.commands[index] = summary;
}
function publicCommand(command) {
  const input = command.input || {};
  return {
    id: command.id,
    sessionId: command.sessionId,
    tool: command.tool,
    cwd: command.cwd || input.cwd || null,
    command: command.tool === 'run_powershell' || command.tool === 'run_tests' ? input.command || '' : null,
    status: command.status,
    risk: command.risk,
    attempts: command.attempts,
    createdAt: command.createdAt,
    startedAt: command.startedAt || null,
    finishedAt: command.finishedAt || null,
    durationMs: command.durationMs || null,
    exitCode: command.result?.exitCode ?? null,
    success: command.status === 'completed',
    error: command.error || command.result?.stderr || null,
    result: command.result || null,
  };
}

async function executeTool(tool, input, commandId) {
  const i = input || {};
  const root = i.cwd ? await workingDirectory(i.cwd) : ALLOWED_CWD;
  if (tool === 'list_directory') return { cwd: root, entries: await fsp.readdir(await safePath(i.path || '.', true, root), { withFileTypes: true }).then(es => es.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))) };
  if (tool === 'inspect_project') {
    const projectRoot = await workingDirectory(i.cwd);
    const names = await fsp.readdir(projectRoot);
    const packagePath = path.join(projectRoot, 'package.json');
    const packageJson = await fsp.readFile(packagePath, 'utf8').then((value) => JSON.parse(value)).catch(() => null);
    const git = await runPowerShell('git status --short', projectRoot, commandId);
    return { cwd: projectRoot, files: names.slice(0, 100), packageManager: fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml')) ? 'pnpm' : (fs.existsSync(path.join(projectRoot, 'yarn.lock')) ? 'yarn' : (fs.existsSync(path.join(projectRoot, 'package-lock.json')) ? 'npm' : null)), package: packageJson ? { name: packageJson.name, scripts: packageJson.scripts || {} } : null, gitStatus: git.stdout, gitExitCode: git.exitCode };
  }
  if (tool === 'verify_project') {
    const projectRoot = await workingDirectory(i.cwd);
    const pkg = await fsp.readFile(path.join(projectRoot, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
    const scripts = pkg?.scripts || {};
    const packageManager = fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml')) ? 'pnpm' : (fs.existsSync(path.join(projectRoot, 'yarn.lock')) ? 'yarn' : 'npm');
    const checks = ['test', 'typecheck', 'lint', 'build'].filter((name) => scripts[name]);
    if (!checks.length) return { cwd: projectRoot, verified: false, reason: 'No test, typecheck, lint, or build script found', scripts, packageManager, checks: [] };
    const results = [];
    for (const name of checks) {
      const command = packageManager === 'npm' ? `npm run ${name}` : `${packageManager} run ${name}`;
      const result = await runPowerShell(command, projectRoot, commandId);
      results.push({ name, command, ...result });
      if (result.exitCode !== 0 || result.stopped) break;
    }
    const verified = results.length === checks.length && results.every((result) => result.exitCode === 0 && !result.stopped);
    return { cwd: projectRoot, verified, packageManager, checks: results, exitCode: verified ? 0 : 1, stdout: results.map((result) => `[${result.name}]\n${result.stdout}`).join('\n'), stderr: results.filter((result) => result.stderr).map((result) => `[${result.name}]\n${result.stderr}`).join('\n') };
  }
  if (tool === 'read_file') return { cwd: root, content: clip(await fsp.readFile(await safePath(i.path, true, root), 'utf8')) };
  if (tool === 'read_text_file') {
    const p = await textPath(i.path, root, true);
    const buffer = await fsp.readFile(p);
    const decoded = decodeText(buffer);
    const outputFile = decoded.content.length > MAX_OUTPUT ? saveResultFile(commandId, decoded.content) : null;
    return { cwd: root, path: path.relative(root, p), content: clip(decoded.content), encoding: decoded.encoding, bytes: buffer.length, truncated: Boolean(outputFile), outputFile, outputId: outputFile ? commandId : null };
  }
  if (tool === 'search_files') { const searchRoot = await safePath(i.path || '.', true, root); const found = []; async function walk(dir) { for (const e of await fsp.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') await walk(p); else if (e.isFile() && (!i.query || (await fsp.readFile(p, 'utf8').catch(() => '')).includes(i.query))) found.push(path.relative(root, p)); if (found.length >= 500) return; } } await walk(searchRoot); return { cwd: root, files: found }; }
  if (tool === 'write_file') { const p = await safePath(i.path, false, root); const backupId = await backupFile(p); await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.writeFile(p, String(i.content || ''), 'utf8'); return { cwd: root, path: path.relative(root, p), written: true, backupId }; }
  if (tool === 'write_text_file') { const p = await textPath(i.path, root, false); const backupId = await backupFile(p); await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.writeFile(p, String(i.content ?? ''), 'utf8'); return { cwd: root, path: path.relative(root, p), written: true, encoding: 'utf8', backupId }; }
  if (tool === 'export_text_file') {
    const filename = exportFileName(i.filename || i.name);
    const content = typeof i.content === 'string' ? i.content : (i.sourcePath ? decodeText(await fsp.readFile(await textPath(i.sourcePath, root, true))).content : null);
    if (content === null) throw new Error('content or sourcePath is required');
    const exportId = id();
    await fsp.mkdir(EXPORTS_DIR, { recursive: true });
    await fsp.writeFile(path.join(EXPORTS_DIR, `${exportId}.txt`), content, 'utf8');
    await fsp.writeFile(path.join(EXPORTS_DIR, `${exportId}.json`), JSON.stringify({ exportId, filename, bytes: Buffer.byteLength(content, 'utf8'), createdAt: new Date().toISOString() }));
    return { exported: true, exportId, filename, bytes: Buffer.byteLength(content, 'utf8'), downloadUrl: `/exports/${exportId}/download` };
  }
  if (tool === 'edit_file') { const p = await safePath(i.path, true, root); const content = await fsp.readFile(p, 'utf8'); if (!content.includes(String(i.oldText))) throw new Error('oldText was not found'); const backupId = await backupFile(p); await fsp.writeFile(p, content.replace(String(i.oldText), String(i.newText || '')), 'utf8'); return { cwd: root, path: path.relative(root, p), edited: true, backupId }; }
  if (tool === 'run_powershell' || tool === 'run_tests') return runPowerShell(i.command, await workingDirectory(i.cwd), commandId);
  if (tool === 'github_status') return runPowerShell('git status --short', await workingDirectory(i.cwd), commandId);
  if (tool === 'docker_version') return runPowerShell('docker version --format "{{.Server.Version}}"', await workingDirectory(i.cwd), commandId);
  if (tool === 'github_clone' || tool === 'github_download_repo') {
    const repository = normalizeGitHubRepository(i.repository || i.repo || i.url);
    const destinationInput = String(i.destination || repository.repo).trim();
    const destination = await safePath(destinationInput, false, root);
    const existing = await fsp.access(destination).then(() => true).catch(() => false);
    if (existing) {
      const stat = await fsp.stat(destination);
      if (!stat.isDirectory() || (await fsp.readdir(destination)).length) throw new Error('clone destination already exists and is not empty');
    }
    const depth = i.depth === undefined ? 1 : Number(i.depth);
    if (!Number.isInteger(depth) || depth < 1 || depth > 1000) throw new Error('depth must be an integer from 1 to 1000');
    const branch = i.branch ? String(i.branch).trim() : '';
    if (branch && !/^[A-Za-z0-9_.\/-]+$/.test(branch)) throw new Error('invalid GitHub branch name');
    const cloneCommand = ['git clone', `--depth ${depth}`, branch ? `--branch ${powerShellQuote(branch)}` : '', powerShellQuote(repository.url), powerShellQuote(destination)].filter(Boolean).join(' ');
    const result = await runPowerShell(cloneCommand, root, commandId);
    return { cwd: root, repository: `${repository.owner}/${repository.repo}`, destination: path.relative(root, destination) || '.', branch: branch || null, downloaded: result.exitCode === 0, ...result };
  }
  if (tool === 'git_status' || tool === 'git_diff') return runPowerShell('git ' + (tool === 'git_status' ? 'status --short' : 'diff --no-ext-diff'), root, commandId);
  throw new Error('unknown tool');
}
async function backupFile(filePath) {
  const backupId = id();
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const exists = await fsp.access(filePath).then(() => true).catch(() => false);
  await fsp.writeFile(path.join(BACKUP_DIR, `${backupId}.json`), JSON.stringify({ backupId, filePath, existed: exists, content: exists ? await fsp.readFile(filePath, 'utf8') : null }));
  return backupId;
}
function sendTextDownload(res, content, filename) {
  const safeName = String(filename).replace(/[\r\n"\\]/g, '_');
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}` });
  res.send(content);
}

app.get('/health', (_req, res) => res.json({ ok: true, cwd: ALLOWED_CWD }));
app.get('/tools', (_req, res) => res.json({ tools: Object.entries(toolDefinitions).map(([name, definition]) => ({ name, ...definition, approvalRequired: definition.risk !== 'low' })) }));
app.get('/skills', async (_req, res) => res.json({ skills: await loadSkills() }));
app.get('/plugins', async (_req, res) => res.json({ plugins: await loadPlugins() }));
app.get('/sessions', (_req, res) => res.json({ sessions: Object.values(sessions) }));
app.get('/sessions/:id', (req, res) => sessions[req.params.id] ? res.json(sessions[req.params.id]) : res.status(404).json({ error: 'session not found' }));
app.get('/commands/:id', (req, res) => { const command = commands.get(req.params.id); if (!command) return res.status(404).json({ error: 'command not found' }); res.json(publicCommand(command)); });
app.get('/commands/:id/wait', requireAgentToken, async (req, res) => {
  const command = commands.get(req.params.id);
  if (!command) return res.status(404).json({ error: 'command not found' });
  const requestedTimeout = Number(req.query.timeout);
  const timeout = Number.isFinite(requestedTimeout) ? Math.max(1000, Math.min(requestedTimeout, COMMAND_WAIT_MS)) : COMMAND_WAIT_MS;
  const deadline = Date.now() + timeout;
  while (!['completed', 'failed', 'cancelled', 'rejected', 'interrupted'].includes(command.status) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
  res.json({ ...publicCommand(command), waitTimedOut: !['completed', 'failed', 'cancelled', 'rejected', 'interrupted'].includes(command.status) });
});
app.get('/results/:id/download', requireAgentToken, async (req, res) => { try { const resultId = safeExportId(req.params.id); const content = await fsp.readFile(path.join(RESULTS_DIR, `${resultId}.txt`), 'utf8'); sendTextDownload(res, content, `result-${resultId}.txt`); } catch (_) { res.status(404).json({ error: 'result file not found' }); } });
app.get('/exports', requireAgentToken, async (_req, res) => { try { const files = await fsp.readdir(EXPORTS_DIR); const exports = []; for (const file of files.filter((name) => name.endsWith('.json'))) { try { exports.push(JSON.parse(await fsp.readFile(path.join(EXPORTS_DIR, file), 'utf8'))); } catch (_) {} } res.json({ exports: exports.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) }); } catch (_) { res.json({ exports: [] }); } });
app.get('/exports/:id/download', requireAgentToken, async (req, res) => { try { const exportId = safeExportId(req.params.id); const metadata = JSON.parse(await fsp.readFile(path.join(EXPORTS_DIR, `${exportId}.json`), 'utf8')); const content = await fsp.readFile(path.join(EXPORTS_DIR, `${exportId}.txt`), 'utf8'); sendTextDownload(res, content, metadata.filename || `export-${exportId}.txt`); } catch (_) { res.status(404).json({ error: 'export file not found' }); } });
app.post('/sessions/:id/stop', requireAgentToken, async (req, res) => { let stopped = 0; for (const command of commands.values()) { if (command.sessionId === req.params.id && ['queued', 'running', 'retrying'].includes(command.status)) { commandStops.set(command.id, 'cancelled'); command.status = 'cancelled'; command.finishedAt = new Date().toISOString(); if (children.has(command.id)) { try { children.get(command.id).kill(); } catch (_) {} } recordSessionCommand(command); stopped++; } } await saveSessions(); res.json({ ok: true, stopped }); });
app.get('/changes/:id', async (req, res) => { try { res.json(JSON.parse(await fsp.readFile(path.join(BACKUP_DIR, `${req.params.id}.json`), 'utf8'))); } catch (_) { res.status(404).json({ error: 'change not found' }); } });
app.get('/changes/:id/diff', async (req, res) => { try { const backup = JSON.parse(await fsp.readFile(path.join(BACKUP_DIR, `${req.params.id}.json`), 'utf8')); const after = await fsp.readFile(backup.filePath, 'utf8').catch(() => null); res.json({ backupId: backup.backupId, path: backup.filePath, before: backup.content, after, changed: backup.content !== after }); } catch (_) { res.status(404).json({ error: 'change not found' }); } });
app.get('/changes', async (_req, res) => { try { const files = await fsp.readdir(BACKUP_DIR); const changes = []; for (const file of files.filter((name) => name.endsWith('.json')).slice(-100)) { try { const change = JSON.parse(await fsp.readFile(path.join(BACKUP_DIR, file), 'utf8')); changes.push({ backupId: change.backupId, path: change.filePath, existed: change.existed }); } catch (_) {} } res.json({ changes: changes.reverse() }); } catch (_) { res.json({ changes: [] }); } });
app.post('/changes/:id/rollback', requireAgentToken, async (req, res) => { try { const backup = JSON.parse(await fsp.readFile(path.join(BACKUP_DIR, `${req.params.id}.json`), 'utf8')); if (backup.existed) await fsp.writeFile(backup.filePath, backup.content, 'utf8'); else await fsp.rm(backup.filePath, { force: true }); res.json({ ok: true, path: backup.filePath }); } catch (e) { res.status(400).json({ error: e.message }); } });

app.post('/tools/:tool/execute', requireAgentToken, async (req, res) => {
  const definition = toolDefinitions[req.params.tool]; if (!definition) return res.status(404).json({ error: 'unknown tool' });
  const input = req.body && (req.body.input || req.body) || {};
  if (input.cwd) {
    try { input.cwd = await workingDirectory(input.cwd); } catch (error) { return res.status(400).json({ error: `invalid cwd: ${error.message}` }); }
  }
  const command = { id: id(), tool: req.params.tool, input, cwd: input.cwd || null, sessionId: (req.body && req.body.sessionId) || 'default', status: 'queued', risk: definition.risk, attempts: 0, createdAt: new Date().toISOString() };
  commands.set(command.id, command); recordSessionCommand(command); await saveSessions();
  if (command.status === 'queued') runCommand(command);
  res.status(202).json(publicCommand(command));
});
async function runCommand(command) {
  command.status = 'running';
  command.attempts++;
  command.startedAt = command.startedAt || new Date().toISOString();
  command.lastAttemptAt = new Date().toISOString();
  recordSessionCommand(command);
  await saveSessions();
  try {
    command.result = await executeTool(command.tool, command.input, command.id);
    const failed = command.result.stopped || (command.result.exitCode !== undefined && command.result.exitCode !== 0);
    if (failed && command.attempts <= RETRY_LIMIT && !command.result.stopped) {
      command.status = 'retrying';
      recordSessionCommand(command);
      await saveSessions();
      await new Promise((resolve) => setTimeout(resolve, 250 * command.attempts));
      return runCommand(command);
    }
    command.status = command.result.stopped === 'timeout' ? 'failed' : (command.result.stopped ? 'cancelled' : (failed ? 'failed' : 'completed'));
    command.finishedAt = new Date().toISOString();
    command.durationMs = Date.parse(command.finishedAt) - Date.parse(command.startedAt);
  } catch (e) {
    command.error = e.message;
    if (command.attempts <= RETRY_LIMIT) {
      command.status = 'retrying';
      await saveSessions();
      await new Promise((resolve) => setTimeout(resolve, 250 * command.attempts));
      return runCommand(command);
    }
    command.status = 'failed';
    command.finishedAt = new Date().toISOString();
    command.durationMs = Date.parse(command.finishedAt) - Date.parse(command.startedAt);
  }
  recordSessionCommand(command);
  await saveSessions();
}
app.post('/commands/:id/:action', requireAgentToken, async (req, res) => { const c = commands.get(req.params.id); if (!c) return res.status(404).json({ error: 'command not found' }); const action = req.params.action; if (action === 'approve' && c.status === 'awaiting_approval') runCommand(c); else if (action === 'reject' && c.status === 'awaiting_approval') c.status = 'rejected'; else if (action === 'cancel' && ['awaiting_approval', 'queued', 'running'].includes(c.status)) { commandStops.set(c.id, 'cancelled'); c.status = 'cancelled'; if (children.has(c.id)) children.get(c.id).kill(); } else return res.status(409).json({ error: 'invalid command state' }); await saveSessions(); res.json(publicCommand(c)); });

app.post('/exec', requireAgentToken, async (req, res) => { const { command, cwd, requestId } = req.body || {}; if (typeof command !== 'string' || !command.trim()) return res.status(400).json({ error: 'command is required' }); try { const result = await runPowerShell(command, await workingDirectory(cwd), requestId || id()); res.json({ ok: true, requestId, ...result }); } catch (e) { res.status(400).json({ error: e.message }); } });

if (require.main === module) {
  Promise.all([loadSessions(), loadSkills(), loadPlugins()]).then(() => app.listen(PORT, '127.0.0.1', () => console.log(`ChatGPT Agent server listening on http://127.0.0.1:${PORT}\nAllowing cwd: ${ALLOWED_CWD}`)));
} else {
  Promise.all([loadSessions(), loadSkills(), loadPlugins()]);
}
module.exports = app;
