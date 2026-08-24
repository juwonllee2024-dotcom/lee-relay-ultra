const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_BOOTSTRAP_MARKER,
  buildSystemPrompt,
  buildTaskPrompt,
  buildStepPrompt,
} = require('./shared/ultra-prompt');

test('Browse Code style system prompt forces observed custom tool protocol', () => {
  const prompt = buildSystemPrompt({ role: 'implementer' });

  assert.match(prompt, new RegExp(DEFAULT_BOOTSTRAP_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(prompt, /custom .*TERMINAL.*TOOL/i);
  assert.match(prompt, /one real .*TERMINAL.*TOOL/i);
  assert.match(prompt, /Never fabricate|do not invent/i);
  assert.match(prompt, /inspect_project/i);
  assert.match(prompt, /verify_project/i);
  assert.match(prompt, /web search|native tools/i);
  assert.match(prompt, /AGENT_COMPLETE/);
});

test('task prompt carries bounded Ultra context without hiding the user task', () => {
  const prompt = buildTaskPrompt({
    task: 'Fix the failing test',
    runId: 'run-123',
    role: 'tester',
    step: 'test',
  });

  assert.match(prompt, /run-123/);
  assert.match(prompt, /tester/);
  assert.match(prompt, /test/);
  assert.match(prompt, /Fix the failing test/);
  assert.match(prompt, /ULTRA_TASK/);
});

test('step prompt explicitly hands the task to the next workflow role', () => {
  const prompt = buildStepPrompt({
    runId: 'run-456',
    task: 'Review the patch',
    role: 'reviewer',
    step: 'review',
    outcome: 'pass',
  });

  assert.match(prompt, /run-456/);
  assert.match(prompt, /reviewer/);
  assert.match(prompt, /Review the patch/);
  assert.match(prompt, /previous workflow step.*pass/i);
});
