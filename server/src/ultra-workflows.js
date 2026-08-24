const WORKFLOW_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'coding',
    name: 'Coding',
    description: 'Plan, implement, review, and test a bounded code change.',
    steps: Object.freeze([
      Object.freeze({ id: 'plan', role: 'planner', title: 'Plan' }),
      Object.freeze({ id: 'implement', role: 'implementer', title: 'Implement' }),
      Object.freeze({ id: 'review', role: 'reviewer', title: 'Review', transitions: Object.freeze({ pass: 'test', fail: 'implement' }) }),
      Object.freeze({ id: 'test', role: 'tester', title: 'Test', transitions: Object.freeze({ pass: 'complete', fail: 'implement' }) }),
    ]),
  }),
  Object.freeze({
    id: 'review',
    name: 'Review',
    description: 'Inspect a workspace and produce a review report.',
    steps: Object.freeze([
      Object.freeze({ id: 'plan', role: 'planner', title: 'Inspect' }),
      Object.freeze({ id: 'review', role: 'reviewer', title: 'Review', transitions: Object.freeze({ pass: 'complete', fail: 'complete' }) }),
    ]),
  }),
  Object.freeze({
    id: 'bugfix',
    name: 'Bug Fix',
    description: 'Reproduce, implement, review, and test a fix.',
    steps: Object.freeze([
      Object.freeze({ id: 'plan', role: 'planner', title: 'Reproduce and plan' }),
      Object.freeze({ id: 'implement', role: 'implementer', title: 'Fix' }),
      Object.freeze({ id: 'test', role: 'tester', title: 'Regression test', transitions: Object.freeze({ pass: 'complete', fail: 'implement' }) }),
    ]),
  }),
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listWorkflows() {
  return WORKFLOW_DEFINITIONS.map(clone);
}

function findWorkflow(workflowId) {
  return WORKFLOW_DEFINITIONS.find((workflow) => workflow.id === workflowId) || null;
}

function safeResult(result) {
  const value = result && typeof result === 'object' ? result : {};
  const safe = {};
  for (const key of ['ok', 'outcome', 'summary', 'findings', 'error']) {
    if (value[key] !== undefined) safe[key] = typeof value[key] === 'string' || typeof value[key] === 'boolean' || Array.isArray(value[key]) ? value[key] : String(value[key]);
  }
  return safe;
}

function createWorkflowRun({ runId, workflowId = 'coding', task, workspaceRoot, guard } = {}) {
  const workflow = findWorkflow(workflowId);
  if (!workflow) throw new Error(`unknown workflow: ${workflowId}`);
  if (!runId || !task || !workspaceRoot) throw new Error('runId, task, and workspaceRoot are required');
  if (!guard || typeof guard.consumeStep !== 'function') throw new Error('loop guard is required');
  guard.consumeStep();

  const state = {
    runId: String(runId),
    workflowId: workflow.id,
    task: String(task),
    workspaceRoot: String(workspaceRoot),
    status: 'running',
    stepIndex: 0,
    steps: workflow.steps.map((step, index) => ({ ...step, status: index === 0 ? 'running' : 'pending', result: null })),
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stopReason: null,
  };

  function currentStep() {
    return state.status === 'completed' || state.status === 'stopped' || state.status === 'failed' ? null : state.steps[state.stepIndex] || null;
  }

  function transitionFor(step, result) {
    if (!step.transitions) return state.steps[state.stepIndex + 1]?.id || 'complete';
    const outcome = result.outcome || (result.ok === false ? 'fail' : 'pass');
    return step.transitions[outcome] || step.transitions.fail || 'complete';
  }

  function advance(result = {}) {
    if (state.status !== 'running') throw new Error(`run is not running: ${state.status}`);
    const step = currentStep();
    if (!step) throw new Error('run has no current step');
    const safe = safeResult(result);
    const successful = safe.outcome ? safe.outcome === 'pass' : safe.ok !== false;
    step.status = successful ? 'completed' : 'failed';
    step.result = safe;
    state.history.push({ stepId: step.id, role: step.role, status: step.status, result: safe, at: new Date().toISOString() });
    if (!successful && !step.transitions) {
      state.status = 'failed';
      state.stepIndex = state.steps.length;
      state.updatedAt = new Date().toISOString();
      return toJSON();
    }
    const nextId = transitionFor(step, safe);
    if (nextId === 'complete') {
      state.status = successful || step.transitions ? 'completed' : 'failed';
      state.stepIndex = state.steps.length;
    } else {
      const nextIndex = state.steps.findIndex((candidate) => candidate.id === nextId);
      if (nextIndex < 0) throw new Error(`workflow transition target not found: ${nextId}`);
      guard.consumeStep();
      state.stepIndex = nextIndex;
      state.steps[nextIndex].status = 'running';
    }
    state.updatedAt = new Date().toISOString();
    return toJSON();
  }

  function pause() {
    if (state.status === 'running') state.status = 'paused';
    state.updatedAt = new Date().toISOString();
    return toJSON();
  }

  function resume() {
    if (state.status === 'paused') state.status = 'running';
    state.updatedAt = new Date().toISOString();
    return toJSON();
  }

  function stop(reason = 'user_stopped') {
    state.status = 'stopped';
    state.stopReason = String(reason);
    guard.stop(state.stopReason);
    state.updatedAt = new Date().toISOString();
    return toJSON();
  }

  function toJSON() {
    return clone(state);
  }

  return Object.freeze({ currentStep, advance, pause, resume, stop, toJSON });
}

module.exports = { createWorkflowRun, listWorkflows };
