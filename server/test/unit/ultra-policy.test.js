const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspacePolicy } = require('../../src/ultra-policy');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lee-relay-ultra-policy-'));
}

test('rejects paths outside the configured workspace', () => {
  const root = makeRoot();
  const policy = createWorkspacePolicy({ root });

  assert.throws(
    () => policy.assertPath(path.join(path.dirname(root), 'outside.txt')),
    (error) => error.code === 'E_WORKSPACE_BOUNDARY',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('accepts an existing directory as a process cwd only inside the workspace', () => {
  const root = makeRoot();
  const nested = fs.mkdtempSync(path.join(root, 'nested-'));
  const policy = createWorkspacePolicy({ root });

  assert.equal(policy.assertCwd(nested), fs.realpathSync(nested));
  assert.throws(
    () => policy.assertCwd(path.dirname(root)),
    (error) => error.code === 'E_WORKSPACE_BOUNDARY',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('denies destructive or repository-publishing commands by default', () => {
  const root = makeRoot();
  const policy = createWorkspacePolicy({ root });

  for (const command of [
    'git push origin main',
    'git merge main',
    'git reset --hard HEAD',
    'Remove-Item -Recurse -Force .',
    'Format-Volume -DriveLetter C',
  ]) {
    assert.throws(
      () => policy.assertCommand(command, 'implementer'),
      (error) => error.code === 'E_COMMAND_POLICY',
    );
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('requires one explicit Auto Coding grant for write-capable actions', () => {
  const root = makeRoot();
  const manual = createWorkspacePolicy({ root, autoCoding: false });
  const automatic = createWorkspacePolicy({ root, autoCoding: true });

  assert.deepEqual(manual.canRun({ role: 'implementer', action: 'write' }), {
    allowed: false,
    reason: 'auto_coding_required',
  });
  assert.deepEqual(automatic.canRun({ role: 'implementer', action: 'write' }), { allowed: true });
  assert.deepEqual(automatic.canRun({ role: 'reviewer', action: 'write' }), {
    allowed: false,
    reason: 'role_capability_denied',
  });
  fs.rmSync(root, { recursive: true, force: true });
});
