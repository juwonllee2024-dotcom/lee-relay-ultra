const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAgentToken } = require('../../src/ultra-auth');

test('uses an explicitly configured token', () => {
  assert.equal(resolveAgentToken({ env: { AGENT_TOKEN: 'long-local-secret', NODE_ENV: 'production' } }), 'long-local-secret');
});

test('refuses to start production without an explicit token', () => {
  assert.throws(
    () => resolveAgentToken({ env: { NODE_ENV: 'production' } }),
    (error) => error.code === 'E_AUTH_CONFIG',
  );
});

test('keeps the development bridge compatible when no token is configured', () => {
  assert.equal(resolveAgentToken({ env: { NODE_ENV: 'development' } }), 'chatgpt-agent-local-v1');
});
