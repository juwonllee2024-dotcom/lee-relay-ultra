// Shared protocol module (Node-compatible copy).
// The extension uses the copy under extension/shared/protocol.js via import.
// Keep both files in sync.

const COMMAND_RE = /<TERMINAL>([\s\S]*?)<\/TERMINAL>/i;

function buildResultMessage(result) {
  const { requestId, exitCode, stdout, stderr, timedOut, command } = result;
  const parts = [];
  parts.push('<TERMINAL_RESULT>');
  parts.push(`request_id: ${requestId || 'unknown'}`);
  parts.push(`command: ${command || ''}`);
  parts.push(`exit_code: ${exitCode ?? -1}`);
  if (timedOut) parts.push('timed_out: true');
  if (stdout && stdout.trim()) parts.push('--- stdout ---\n' + stdout.trim());
  if (stderr && stderr.trim()) parts.push('--- stderr ---\n' + stderr.trim());
  parts.push('</TERMINAL_RESULT>');
  parts.push('');
  parts.push('Based on this result, decide the next step. If the task is complete, say so. Otherwise output the next <TERMINAL>...</TERMINAL> command.');
  return parts.join('\n');
}

module.exports = { COMMAND_RE, buildResultMessage };
