const fs = require('node:fs');
const path = require('node:path');

const WRITE_ACTIONS = new Set(['write', 'edit', 'terminal', 'test', 'build']);
const ROLE_CAPABILITIES = Object.freeze({
  planner: new Set(['inspect', 'read', 'search', 'git_status', 'git_diff']),
  implementer: new Set(['inspect', 'read', 'search', 'git_status', 'git_diff', 'write', 'edit', 'terminal', 'test', 'build']),
  reviewer: new Set(['inspect', 'read', 'search', 'git_status', 'git_diff']),
  tester: new Set(['inspect', 'read', 'search', 'git_status', 'git_diff', 'terminal', 'test', 'build']),
});

const DENIED_COMMANDS = [
  /\bgit\s+(?:push|merge)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  /\b(?:Remove-Item|Remove-Module|Format-Volume|Clear-Disk|Stop-Computer)\b/i,
  /(?:^|[;|&])\s*(?:del|erase|rd|rmdir|rm)\b/i,
];

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function realPathOrParent(candidate, root) {
  if (fs.existsSync(candidate)) return fs.realpathSync.native(candidate);
  let parent = path.dirname(candidate);
  while (!fs.existsSync(parent) && parent !== path.dirname(parent)) parent = path.dirname(parent);
  const realParent = fs.realpathSync.native(parent);
  return path.join(realParent, path.relative(parent, candidate));
}

function createWorkspacePolicy({ root, autoCoding = false } = {}) {
  const requestedRoot = path.resolve(String(root || process.cwd()));
  if (!fs.existsSync(requestedRoot) || !fs.statSync(requestedRoot).isDirectory()) {
    throw policyError('E_WORKSPACE_ROOT', 'workspace root must be an existing directory');
  }
  const workspaceRoot = fs.realpathSync.native(requestedRoot);

  function assertPath(candidate) {
    if (typeof candidate !== 'string' || !candidate.trim()) throw policyError('E_PATH_REQUIRED', 'path is required');
    const lexical = path.resolve(workspaceRoot, candidate);
    if (!isInside(workspaceRoot, lexical)) throw policyError('E_WORKSPACE_BOUNDARY', 'path is outside the configured workspace');
    const resolved = realPathOrParent(lexical, workspaceRoot);
    if (!isInside(workspaceRoot, resolved)) throw policyError('E_WORKSPACE_BOUNDARY', 'path resolves outside the configured workspace');
    return resolved;
  }

  function assertCwd(candidate) {
    const resolved = assertPath(candidate || workspaceRoot);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw policyError('E_CWD_INVALID', 'cwd is not a directory');
    return fs.realpathSync.native(resolved);
  }

  function assertCommand(command) {
    if (typeof command !== 'string' || !command.trim()) throw policyError('E_COMMAND_REQUIRED', 'command is required');
    const normalized = command.trim();
    if (DENIED_COMMANDS.some((pattern) => pattern.test(normalized))) {
      throw policyError('E_COMMAND_POLICY', 'command is denied by the Ultra safety policy');
    }
    return normalized;
  }

  function canRun({ role, action } = {}) {
    const capabilities = ROLE_CAPABILITIES[String(role || '')];
    if (!capabilities) return { allowed: false, reason: 'unknown_role' };
    if (!capabilities.has(action)) return { allowed: false, reason: 'role_capability_denied' };
    if (WRITE_ACTIONS.has(action) && !autoCoding) return { allowed: false, reason: 'auto_coding_required' };
    return { allowed: true };
  }

  return Object.freeze({
    root: workspaceRoot,
    autoCoding: Boolean(autoCoding),
    assertPath,
    assertCwd,
    assertCommand,
    canRun,
  });
}

module.exports = { createWorkspacePolicy, ROLE_CAPABILITIES, WRITE_ACTIONS };
