function resolveAgentToken({ env = process.env } = {}) {
  const configured = String(env.AGENT_TOKEN || '').trim();
  if (configured) return configured;
  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    const error = new Error('AGENT_TOKEN must be configured in production');
    error.code = 'E_AUTH_CONFIG';
    throw error;
  }
  return 'chatgpt-agent-local-v1';
}

module.exports = { resolveAgentToken };
