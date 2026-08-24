const test = require('node:test');
const assert = require('node:assert/strict');
const { listRoles } = require('../../src/ultra-roles');
const { createLoopGuard } = require('../../src/ultra-loop-guard');
const { createWorkflowRun, listWorkflows } = require('../../src/ultra-workflows');

test('exposes the four default coding roles with bounded capabilities', () => {
  const roles = listRoles();
  assert.deepEqual(roles.map((role) => role.id), ['planner', 'implementer', 'reviewer', 'tester']);
  assert.equal(roles.find((role) => role.id === 'planner').canWrite, false);
  assert.equal(roles.find((role) => role.id === 'implementer').canWrite, true);
  assert.ok(roles.find((role) => role.id === 'reviewer').capabilities.includes('git_diff'));
  assert.ok(listWorkflows().some((workflow) => workflow.id === 'coding'));
});

test('loop guard stops after the configured step and retry limits', () => {
  const guard = createLoopGuard({ maxSteps: 2, maxCommands: 3, maxMinutes: 10, maxRetries: 1 });

  assert.equal(guard.consumeStep(), 1);
  assert.equal(guard.consumeStep(), 2);
  assert.throws(() => guard.consumeStep(), (error) => error.code === 'E_LOOP_GUARD');
  assert.throws(() => guard.consumeRetry(), (error) => error.code === 'E_LOOP_GUARD');
  assert.equal(guard.stopReason(), 'max_steps');
  assert.equal(guard.snapshot().steps, 2);
});

test('coding workflow routes review and test failures back to the implementer', () => {
  const guard = createLoopGuard({ maxSteps: 12, maxCommands: 20, maxMinutes: 10, maxRetries: 3 });
  const run = createWorkflowRun({ runId: 'run-1', workflowId: 'coding', task: 'add a feature', workspaceRoot: 'C:\\workspace', guard });

  assert.equal(run.currentStep().id, 'plan');
  run.advance({ ok: true, summary: 'plan ready' });
  assert.equal(run.currentStep().id, 'implement');
  run.advance({ ok: true, summary: 'code written' });
  assert.equal(run.currentStep().id, 'review');
  run.advance({ outcome: 'fail', findings: ['missing test'] });
  assert.equal(run.currentStep().id, 'implement');
  run.advance({ ok: true, summary: 'test added' });
  run.advance({ outcome: 'pass', summary: 'review passed' });
  assert.equal(run.currentStep().id, 'test');
  run.advance({ outcome: 'fail', findings: ['one failure'] });
  assert.equal(run.currentStep().id, 'implement');
  assert.equal(run.toJSON().status, 'running');
});

test('coding workflow completes after a passing review and test', () => {
  const guard = createLoopGuard({ maxSteps: 8, maxCommands: 20, maxMinutes: 10, maxRetries: 2 });
  const run = createWorkflowRun({ runId: 'run-2', workflowId: 'coding', task: 'small change', workspaceRoot: 'C:\\workspace', guard });

  run.advance({ ok: true });
  run.advance({ ok: true });
  run.advance({ outcome: 'pass' });
  run.advance({ outcome: 'pass' });
  assert.equal(run.toJSON().status, 'completed');
  assert.equal(run.currentStep(), null);
});

test('stops instead of skipping ahead when a non-review implementation step fails', () => {
  const guard = createLoopGuard({ maxSteps: 8, maxCommands: 20, maxMinutes: 10, maxRetries: 2 });
  const run = createWorkflowRun({ runId: 'run-3', workflowId: 'coding', task: 'broken plan', workspaceRoot: 'C:\\workspace', guard });

  run.advance({ ok: false, error: 'workspace could not be inspected' });
  assert.equal(run.toJSON().status, 'failed');
  assert.equal(run.currentStep(), null);
});
