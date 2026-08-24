const ROLE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'planner', name: 'Planner', description: 'Inspects the workspace and writes an implementation plan.', canWrite: false, capabilities: Object.freeze(['inspect', 'read', 'search', 'git_status', 'git_diff']) }),
  Object.freeze({ id: 'implementer', name: 'Implementer', description: 'Edits files and runs bounded development commands.', canWrite: true, capabilities: Object.freeze(['inspect', 'read', 'search', 'git_status', 'git_diff', 'write', 'edit', 'terminal', 'test', 'build']) }),
  Object.freeze({ id: 'reviewer', name: 'Reviewer', description: 'Reviews the diff and reports actionable findings.', canWrite: false, capabilities: Object.freeze(['inspect', 'read', 'search', 'git_status', 'git_diff']) }),
  Object.freeze({ id: 'tester', name: 'Tester', description: 'Runs tests and builds and reports failures.', canWrite: false, capabilities: Object.freeze(['inspect', 'read', 'search', 'git_status', 'git_diff', 'terminal', 'test', 'build']) }),
]);

function copyRole(role) {
  return { ...role, capabilities: [...role.capabilities] };
}

function listRoles() {
  return ROLE_DEFINITIONS.map(copyRole);
}

function getRole(roleId) {
  const role = ROLE_DEFINITIONS.find((item) => item.id === roleId);
  return role ? copyRole(role) : null;
}

module.exports = { listRoles, getRole };
