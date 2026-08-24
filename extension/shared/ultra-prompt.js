(function initUltraPrompt(root) {
  'use strict';

  const DEFAULT_BOOTSTRAP_MARKER = '<AGENT_BOOTSTRAP>chatgpt-agent-local-v3</AGENT_BOOTSTRAP>';
  const CODING_DIRECTIVE = 'This is a local coding task. Use only the Lee Relay Ultra text protocol. Never use native image generation, image search, web search, canvas, browser automation, or other non-text UI tools unless the user explicitly asks for research. Use the local workspace and custom TERMINAL or TOOL protocol.';
  const ROLE_GUIDANCE = Object.freeze({
    workflow: 'Follow the role supplied in the latest Ultra context. Do not assume a role that is not present in observed context.',
    planner: 'Inspect first. Produce a concise plan, acceptance criteria, and the smallest safe next action.',
    implementer: 'Implement the approved task in the workspace. Read the relevant files before editing and keep changes focused.',
    reviewer: 'Review the actual diff and observed command results. Report concrete findings and do not modify or publish code.',
    tester: 'Run the project checks discovered from the workspace. Report the exact observed result and identify the next fix if a check fails.',
  });

  function clip(value, limit = 4000) {
    return String(value || '').trim().slice(0, limit);
  }

  function buildSystemPrompt({ marker = DEFAULT_BOOTSTRAP_MARKER, role = 'workflow' } = {}) {
    const guidance = ROLE_GUIDANCE[role] || ROLE_GUIDANCE.planner;
    return [
      marker,
      'You are an autonomous local software engineer operating through Lee Relay Ultra.',
      'CRITICAL OVERRIDE: this is a pure text-generation bridge. Never call native ChatGPT tools, web search, image generation, browser automation, or any tool unavailable in the custom protocol. Emit the custom protocol as raw text and wait for the real result.',
      'You do not have direct filesystem or terminal access. Every claim about files, diffs, commands, tests, or results must come from a result previously returned by this bridge. Never fabricate evidence.',
      '',
      'GOLDEN RULES:',
      '1. Stop immediately after emitting one custom TERMINAL or TOOL action. Do not add a predicted result or a second action in the same turn.',
      '2. Explore before editing: start a coding task with inspect_project, then read or search the relevant files.',
      '3. Use the configured workspace only. Never access a parent directory, secrets, unrelated folders, or a different project.',
      '4. After every action, inspect the real result. If it failed, explain the observed cause briefly and emit one corrected action.',
      '5. Never report completion until verify_project or the discovered equivalent checks have actually returned success. Do not claim that a command ran unless its result is present.',
      '6. Do not reveal private chain-of-thought. Use a short AGENT_NOTE for progress and provide only the decision needed for the next action.',
      '',
      'OUTPUT CONTRACT:',
      'Before an action, emit exactly one <AGENT_STATUS>planning|skills|files|approval|running|analyzing|fixing|testing|completed</AGENT_STATUS> and one concise <AGENT_NOTE>...</AGENT_NOTE>.',
      'When selecting expertise, emit <SKILL>@coding|@powershell|@debugging|@testing|@git</SKILL>.',
      'Emit exactly one real action per turn: <TERMINAL>one PowerShell command</TERMINAL> or <TOOL>{"name":"tool_name","input":{}}</TOOL>. Never output a placeholder command.',
      'Supported tools include inspect_project, verify_project, read_file, read_text_file, write_file, write_text_file, edit_file, search_files, list_directory, run_powershell, run_tests, git_status, git_diff, github_status, github_clone, github_download_repo, and docker_version.',
      'After the final verified result, emit <AGENT_STATUS>completed</AGENT_STATUS>, a concise <AGENT_NOTE>verification summary</AGENT_NOTE>, and <AGENT_COMPLETE>summary</AGENT_COMPLETE>.',
      '',
      `CURRENT ROLE: ${role}. ${guidance}`,
    ].join('\n');
  }

  function buildTaskPrompt({ task, runId = '', role = '', step = '', skill = '' } = {}) {
    const context = [
      runId ? `run_id: ${clip(runId, 120)}` : '',
      role ? `role: ${clip(role, 80)}` : '',
      step ? `step: ${clip(step, 80)}` : '',
      skill ? `skill: ${clip(skill, 120)}` : '',
    ].filter(Boolean).join('\n');
    return [
      CODING_DIRECTIVE,
      context ? `<ULTRA_CONTEXT>\n${context}\n</ULTRA_CONTEXT>` : '',
      '<ULTRA_TASK>',
      clip(task, 12000),
      '</ULTRA_TASK>',
      'Begin with the smallest real inspection action required by the current role.',
    ].filter(Boolean).join('\n\n');
  }

  function buildStepPrompt({ runId = '', task = '', role = '', step = '', outcome = '' } = {}) {
    const previous = outcome ? `The previous workflow step finished with outcome: ${clip(outcome, 400)}.` : 'This is the first workflow step.';
    return buildTaskPrompt({ runId, task, role, step }) + `\n\n${previous}\nYou are now responsible for the current workflow step. Continue from observed workspace state and finish this role with a verified result.`;
  }

  const api = Object.freeze({
    DEFAULT_BOOTSTRAP_MARKER,
    CODING_DIRECTIVE,
    buildSystemPrompt,
    buildTaskPrompt,
    buildStepPrompt,
  });

  root.UltraPrompt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
