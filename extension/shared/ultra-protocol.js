(function initUltraProtocol(root) {
  'use strict';

  const TERMINAL_RE = /<TERMINAL>\s*([\s\S]*?)\s*<\/TERMINAL>/gi;
  const JSON_TOOL_RE = /<TOOL>\s*([\s\S]*?)\s*<\/TOOL>/gi;
  const XML_TOOL_RE = /<tool\s*=\s*(['"])([^'"]+)\1\s*>([\s\S]*?)<\/tool>/gi;

  function text(value) {
    return String(value || '');
  }

  function normalizeXmlTool(name, payload) {
    const normalized = text(name).trim().toLowerCase();
    const body = text(payload).trim();
    const aliases = {
      terminal_run: { name: 'run_powershell', input: { command: body } },
      terminal_bg: { name: 'run_powershell', input: { command: body }, background: true },
      run_powershell: { name: 'run_powershell', input: { command: body } },
      view_dir: { name: 'list_directory', input: { path: body || '.' } },
      list_directory: { name: 'list_directory', input: { path: body || '.' } },
      search_code: { name: 'search_files', input: { query: body } },
      search_files: { name: 'search_files', input: { query: body } },
      read: { name: 'read_text_file', input: { path: body } },
      read_lines: { name: 'read_text_file', input: { path: body } },
      read_text_file: { name: 'read_text_file', input: { path: body } },
      git_status: { name: 'git_status', input: {} },
      git_diff: { name: 'git_diff', input: {} },
      docker_version: { name: 'docker_version', input: {} },
    };
    const mapped = aliases[normalized];
    if (mapped) return { ...mapped, reason: `Browse Code ${normalized}` };
    return { name: normalized, input: { payload: body }, reason: `Browse Code ${normalized}` };
  }

  function parseJsonTools(value) {
    const tools = [];
    const errors = [];
    let match;
    const re = new RegExp(JSON_TOOL_RE.source, 'gi');
    while ((match = re.exec(value))) {
      try {
        const parsed = JSON.parse(match[1]);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.name !== 'string' || !parsed.name.trim()) {
          throw new Error('tool name is required');
        }
        tools.push({
          order: match.index,
          tool: {
            name: parsed.name.trim(),
            input: parsed.input && typeof parsed.input === 'object' ? parsed.input : {},
            ...(parsed.reason ? { reason: String(parsed.reason) } : {}),
          },
        });
      } catch (error) {
        errors.push(`TOOL JSON error: ${error.message}`);
      }
    }
    return { tools, errors };
  }

  function parseXmlTools(value) {
    const tools = [];
    let match;
    const re = new RegExp(XML_TOOL_RE.source, 'gi');
    while ((match = re.exec(value))) {
      tools.push({ order: match.index, tool: normalizeXmlTool(match[2], match[3]) });
    }
    return tools;
  }

  function parseAgentResponse(value) {
    const source = text(value);
    const terminalCommands = [];
    let match;
    const terminalRe = new RegExp(TERMINAL_RE.source, 'gi');
    while ((match = terminalRe.exec(source))) terminalCommands.push({ order: match.index, command: match[1].trim() });

    const json = parseJsonTools(source);
    const xmlTools = parseXmlTools(source);
    const tools = [...json.tools, ...xmlTools].sort((a, b) => a.order - b.order);
    const actions = [
      ...terminalCommands.map((entry) => ({ order: entry.order, action: { type: 'terminal', command: entry.command } })),
      ...tools.map((entry) => ({ order: entry.order, action: { type: 'tool', tool: entry.tool } })),
    ].sort((a, b) => a.order - b.order).map((entry) => entry.action);

    let protocolError = json.errors.length ? 'malformed_tool_json' : null;
    if (!protocolError && actions.length > 1) protocolError = 'one_action_per_turn';
    if (!protocolError && !actions.length && /<TERMINAL\b|<TOOL\b|<tool\s*=/i.test(source) && !/<(?:\/TERMINAL|\/TOOL|\/tool)>/i.test(source)) protocolError = 'malformed_protocol';

    return {
      status: source.match(/<AGENT_STATUS>\s*([^<]+?)\s*<\/AGENT_STATUS>/i)?.[1]?.trim().toLowerCase() || '',
      skill: source.match(/<SKILL>\s*([^<]+?)\s*<\/SKILL>/i)?.[1]?.trim() || '',
      note: source.match(/<AGENT_NOTE>\s*([\s\S]*?)\s*<\/AGENT_NOTE>/i)?.[1]?.trim() || '',
      complete: /<AGENT_COMPLETE>[\s\S]*?<\/AGENT_COMPLETE>/i.test(source),
      terminalCommands: terminalCommands.map((entry) => entry.command),
      toolCalls: tools.map((entry) => entry.tool),
      actions,
      protocolError,
      hasProtocol: actions.length > 0 || /<AGENT_COMPLETE>[\s\S]*?<\/AGENT_COMPLETE>/i.test(source),
    };
  }

  function buildTerminalResultMessage(result = {}) {
    const previewLimit = result.outputFile ? 3000 : 20000;
    const preview = (value) => text(value).slice(0, previewLimit);
    const parts = ['<TERMINAL_RESULT>'];
    parts.push(`request_id: ${result.requestId || 'unknown'}`);
    parts.push(`command: ${result.command || ''}`);
    parts.push(`exit_code: ${result.exitCode ?? -1}`);
    if (result.timedOut) parts.push('timed_out: true');
    if (result.stdout && text(result.stdout).trim()) parts.push('--- stdout ---\n' + preview(result.stdout).trim());
    if (result.stderr && text(result.stderr).trim()) parts.push('--- stderr ---\n' + preview(result.stderr).trim());
    if (result.outputFile) parts.push(`output_file_id: ${result.outputId || 'unknown'}\n(full output is available from the Side Panel result file)`);
    parts.push('</TERMINAL_RESULT>', '', 'Use only this observed result. If another action is required, emit exactly one next <TERMINAL>...</TERMINAL> or <TOOL>...</TOOL> action. If the task is verified, finish with <AGENT_COMPLETE>.');
    return parts.join('\n');
  }

  const api = Object.freeze({ parseAgentResponse, buildTerminalResultMessage });
  root.UltraProtocol = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
