const crypto = require('node:crypto');
const { createWorkspacePolicy } = require('./ultra-policy');
const { createLoopGuard } = require('./ultra-loop-guard');
const { createWorkflowRun, listWorkflows } = require('./ultra-workflows');

const WRITE_WORKFLOWS = new Set(['coding', 'bugfix']);

function typedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createUltraRunRegistry({ baseRoot, idFactory = crypto.randomUUID } = {}) {
  const basePolicy = createWorkspacePolicy({ root: baseRoot, autoCoding: true });
  const runs = new Map();

  function publicState(entry) {
    return {
      ...entry.run.toJSON(),
      currentStep: entry.run.currentStep(),
      guard: entry.guard.snapshot(),
    };
  }

  function create(input = {}) {
    const workflowId = String(input.workflowId || 'coding');
    const autoCoding = input.autoCoding === true;
    if (WRITE_WORKFLOWS.has(workflowId) && !autoCoding) throw typedError('E_AUTO_CODING', 'auto coding grant is required for this workflow');
    const root = basePolicy.assertCwd(input.cwd || basePolicy.root);
    const policy = createWorkspacePolicy({ root, autoCoding });
    const runId = String(idFactory());
    const guard = createLoopGuard(input.limits || {});
    const run = createWorkflowRun({ runId, workflowId, task: input.task, workspaceRoot: policy.root, guard });
    const entry = { run, guard, policy, autoCoding };
    runs.set(runId, entry);
    return publicState(entry);
  }

  function entryFor(runId) {
    return runs.get(String(runId)) || null;
  }

  function state(runId) {
    const entry = entryFor(runId);
    return entry ? publicState(entry) : null;
  }

  function mutate(runId, action, payload) {
    const entry = entryFor(runId);
    if (!entry) throw typedError('E_RUN_NOT_FOUND', 'run not found');
    if (action === 'pause') entry.run.pause();
    else if (action === 'resume') entry.run.resume();
    else if (action === 'stop') entry.run.stop(payload?.reason || 'user_stopped');
    else if (action === 'advance') entry.run.advance(payload?.result || payload || {});
    else throw typedError('E_RUN_ACTION', 'unknown run action');
    return publicState(entry);
  }

  function authorizeTool(runId, action, claimedRole) {
    const entry = entryFor(runId);
    if (!entry) throw typedError('E_RUN_NOT_FOUND', 'run not found');
    if (entry.run.toJSON().status !== 'running') return { allowed: false, reason: 'run_not_active' };
    const role = entry.run.currentStep()?.role;
    if (!role || (claimedRole && claimedRole !== role)) return { allowed: false, reason: 'role_mismatch' };
    return entry.policy.canRun({ role, action });
  }

  return Object.freeze({
    create,
    state,
    mutate,
    authorizeTool,
    list: () => [...runs.values()].map(publicState),
    roles: () => require('./ultra-roles').listRoles(),
    workflows: () => listWorkflows(),
  });
}

module.exports = { createUltraRunRegistry };
