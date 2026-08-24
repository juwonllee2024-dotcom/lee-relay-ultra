const test = require('node:test');
const assert = require('node:assert/strict');
const { readUltraContext } = require('./shared/ultra-context');

test('reads the active Ultra run and role from extension storage', async () => {
  const storage = { get: (_keys, callback) => callback({ ultraRunId: 'run-1', ultraRole: 'implementer' }) };
  assert.deepEqual(await readUltraContext(storage), { ultraRunId: 'run-1', ultraRole: 'implementer' });
});

test('returns an empty context when storage is unavailable', async () => {
  assert.deepEqual(await readUltraContext(null), { ultraRunId: '', ultraRole: '' });
});
