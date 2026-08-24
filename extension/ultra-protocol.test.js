const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAgentResponse,
  buildTerminalResultMessage,
} = require('./shared/ultra-protocol');

test('protocol parser extracts one Ultra terminal action and progress markers', () => {
  const parsed = parseAgentResponse([
    '<AGENT_STATUS>running</AGENT_STATUS>',
    '<AGENT_NOTE>Checking the project</AGENT_NOTE>',
    '<TERMINAL>Get-ChildItem</TERMINAL>',
  ].join('\n'));

  assert.equal(parsed.status, 'running');
  assert.equal(parsed.note, 'Checking the project');
  assert.equal(parsed.actions.length, 1);
  assert.deepEqual(parsed.actions[0], { type: 'terminal', command: 'Get-ChildItem' });
  assert.equal(parsed.protocolError, null);
});

test('protocol parser accepts Browse Code terminal XML and normalizes it to Ultra', () => {
  const parsed = parseAgentResponse("<tool='terminal_run'>npm test</tool>");

  assert.equal(parsed.actions.length, 1);
  assert.deepEqual(parsed.actions[0], {
    type: 'tool',
    tool: { name: 'run_powershell', input: { command: 'npm test' }, reason: 'Browse Code terminal_run' },
  });
});

test('protocol parser rejects multiple actions in one model turn', () => {
  const parsed = parseAgentResponse('<TERMINAL>npm test</TERMINAL>\n<TOOL>{"name":"git_status","input":{}}</TOOL>');

  assert.equal(parsed.actions.length, 2);
  assert.equal(parsed.protocolError, 'one_action_per_turn');
});

test('protocol parser recognizes verified completion separately from ordinary prose', () => {
  assert.equal(parseAgentResponse('<AGENT_COMPLETE>tests pass</AGENT_COMPLETE>').complete, true);
  assert.equal(parseAgentResponse('I think this is complete.').complete, false);
});

test('terminal result feedback contains bounded execution evidence', () => {
  const message = buildTerminalResultMessage({
    requestId: 'req-1',
    command: 'npm test',
    exitCode: 1,
    stdout: '',
    stderr: 'one failure',
  });

  assert.match(message, /<TERMINAL_RESULT>/);
  assert.match(message, /request_id: req-1/);
  assert.match(message, /exit_code: 1/);
  assert.match(message, /one failure/);
  assert.match(message, /next/i);
});
