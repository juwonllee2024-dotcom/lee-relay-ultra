const SERVER_URL = 'http://localhost:5747';
const AGENT_TOKEN = 'chatgpt-agent-local-v1';
const AGENT_BOOTSTRAP_MARKER = '<AGENT_BOOTSTRAP>chatgpt-agent-local-v2</AGENT_BOOTSTRAP>';
const LOCAL_CODING_DIRECTIVE = 'This is a local coding task. Never use native image generation, image search, web search, canvas, browser automation, or any non-text UI tool. Never create or request an image. For visual website work, edit the local project files using the custom TERMINAL or TOOL protocol. Output exactly one real custom TERMINAL or TOOL call, starting with inspect_project when project context is needed.';
const COMMAND_RE = /<TERMINAL>([\s\S]*?)<\/TERMINAL>/gi;
let sequence = 0;
let processing = false;
let rerunRequested = false;
const processed = new Set();
let agentMode = false;
let currentConversation = typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`;
let lastAgentMarker = '';
let sending = false;
let taskActive = false;
let pendingSkillPrompt = '';
let taskWatchdogTimer = null;
let protocolRecoveryAttempts = 0;
let executionEnabled = false;
let lastSentText = '';
let lastSentAt = 0;
let candidateText = '';
let candidateSince = 0;
let eventWrite = Promise.resolve();
const pendingReplies = new Map();

function resetConversationState() {
  if (typeof location === 'undefined') return;
  const nextConversation = `${location.origin}${location.pathname}`;
  if (nextConversation === currentConversation) return;
  if (taskActive) {
    currentConversation = nextConversation;
    return;
  }
  currentConversation = nextConversation;
  agentMode = false;
  taskActive = false;
  stopTaskWatchdog();
  pendingSkillPrompt = '';
  protocolRecoveryAttempts = 0;
  lastAgentMarker = '';
  candidateText = '';
  candidateSince = 0;
  processed.clear();
  pendingReplies.clear();
}

function logEvent(kind, text, commandId) {
  eventWrite = eventWrite.then(() => new Promise((resolve) => {
    if (!chrome.runtime?.id) return resolve();
    chrome.storage.local.get({ agentEvents: [] }, ({ agentEvents }) => {
      if (chrome.runtime.lastError || !chrome.runtime?.id) return resolve();
      const stage = { command: 'running', approval: 'waiting_approval', result: 'analyzing', error: 'fixing', info: 'planning', skill: 'skills', files: 'files' }[kind] || kind;
      const next = [...agentEvents, { kind, stage, text, commandId, at: Date.now() }].slice(-100);
      chrome.storage.local.set({ agentEvents: next }, resolve);
    });
  })).catch(() => {});
  return eventWrite;
}

function buildResultMessage(result) {
  const { requestId, exitCode, stdout, stderr, timedOut, command, outputFile, outputId } = result;
  const previewLimit = result.outputFile ? 3000 : 20000;
  const preview = (value) => String(value || '').slice(0, previewLimit);
  const parts = ['<TERMINAL_RESULT>'];
  parts.push(`request_id: ${requestId || 'unknown'}`);
  parts.push(`command: ${command || ''}`);
  parts.push(`exit_code: ${exitCode ?? -1}`);
  if (timedOut) parts.push('timed_out: true');
  if (stdout && stdout.trim()) parts.push('--- stdout ---\n' + preview(stdout).trim());
  if (stderr && stderr.trim()) parts.push('--- stderr ---\n' + preview(stderr).trim());
  if (outputFile) parts.push(`output_file_id: ${outputId || 'unknown'}\n(출력이 길어 전체 결과를 파일로 저장했습니다. Side Panel에서 TXT로 다운로드할 수 있습니다.)`);
  parts.push('</TERMINAL_RESULT>', '', 'Based on this result, decide the next step. If the task is complete, say so. Otherwise output the next <TERMINAL>...</TERMINAL> command.');
  return parts.join('\n');
}

function getCwd() {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) return resolve('');
    chrome.storage.local.get('cwd', (r) => resolve(chrome.runtime.lastError ? '' : (r.cwd || '')));
  });
}

function bubbleKey(bubble) {
  const text = bubble?.innerText || '';
  return `bubble-${bubble?.getAttribute?.('data-message-id') || `${text.length}:${text.slice(-120)}`}`;
}

function protocolText() {
  return document.body?.textContent || '';
}

function hasAgentBootstrap() {
  return protocolText().includes(AGENT_BOOTSTRAP_MARKER);
}

function hideBootstrapBubble() {
  const bubble = [...document.querySelectorAll('[data-message-author-role="user"]')]
    .find((node) => node.textContent?.includes(AGENT_BOOTSTRAP_MARKER) || node.textContent?.includes('<AGENT_TASK>'));
  if (bubble) {
    bubble.dataset.chatgptAgentBootstrap = 'hidden';
    bubble.style.display = 'none';
  }
}

function buildBootstrap() {
  return `${AGENT_BOOTSTRAP_MARKER}\nYou are a local coding agent connected to Windows PowerShell. Follow these rules exactly.\nImportant: TERMINAL and TOOL are custom text protocols implemented by a Chrome extension, not native ChatGPT tools. Never claim that a custom tool is unregistered or unavailable. Output the protocol and wait for the result.\nBefore every action, output one status marker: <AGENT_STATUS>planning|skills|files|approval|running|analyzing|fixing|testing|completed</AGENT_STATUS>.\nAlso output one short user-facing explanation in <AGENT_NOTE>what you are doing and why</AGENT_NOTE>. Do not reveal private chain-of-thought; give only a concise progress update.\nWhen choosing expertise, output <SKILL>@name</SKILL>.\nAt the start of every coding task, first call inspect_project with the configured working directory. Do not assume npm, a framework, or a test command.\nPowerShell format: output exactly one real PowerShell command inside <TERMINAL>...</TERMINAL>. Never output the placeholder words one PowerShell command. Local tool format: output exactly one real JSON call inside <TOOL>...</TOOL>. Use exactly one TERMINAL or TOOL per turn.\nCustom tools: inspect_project, verify_project, read_file, read_text_file, write_file, write_text_file, export_text_file, edit_file, search_files, list_directory, run_powershell, git_status, git_diff, run_tests, github_status, github_clone, github_download_repo, docker_version.\nAfter every TERMINAL_RESULT or TOOL_RESULT, analyze the result. If it failed, output <AGENT_STATUS>fixing</AGENT_STATUS>, explain the cause briefly in <AGENT_NOTE>, and produce one corrected action. Before completion, call verify_project and only report completed when verified is true or when you explicitly explain that no test/build script exists. When finished, output <AGENT_STATUS>completed</AGENT_STATUS>, an <AGENT_NOTE>final verification summary</AGENT_NOTE>, and <AGENT_COMPLETE>summary</AGENT_COMPLETE>. Available skills: @coding, @powershell, @debugging, @testing, @git.`;
}

function bootstrapPrompt() {
  return buildBootstrap()
    .replace(/<TERMINAL>\.\.\.<\/TERMINAL>/g, 'Use TERMINAL tags around one real PowerShell command.')
    .replace(/<TOOL>\.\.\.<\/TOOL>/g, 'Use TOOL tags around one real JSON tool call.')
    .replace(`${AGENT_BOOTSTRAP_MARKER}\n`, `${AGENT_BOOTSTRAP_MARKER}\n${LOCAL_CODING_DIRECTIVE}\n`);
}

function taskPrompt(text) {
  const skill = pendingSkillPrompt ? `\n\n${pendingSkillPrompt}` : '';
  return `${LOCAL_CODING_DIRECTIVE}${skill}\n\nThe user task from the Side Panel is:\n${String(text).trim()}`;
}

function stopTaskWatchdog() {
  if (taskWatchdogTimer) clearTimeout(taskWatchdogTimer);
  taskWatchdogTimer = null;
}

function setExecutionEnabled(enabled) {
  executionEnabled = Boolean(enabled);
  if (!executionEnabled) {
    taskActive = false;
    stopTaskWatchdog();
    pendingReplies.clear();
    pendingSkillPrompt = '';
    protocolRecoveryAttempts = 0;
    agentMode = false;
    unlockComposer(getComposer());
  } else {
    lockComposer(getComposer());
  }
}

function requestExecutionState() {
  if (!chrome.runtime?.sendMessage) return;
  try {
    const response = chrome.runtime.sendMessage({ type: 'GET_EXECUTION_STATE' });
    response?.then?.((result) => {
      if (result?.ok) setExecutionEnabled(result.enabled);
    }).catch?.(() => {});
  } catch (_) {}
}

function startTaskWatchdog() {
  stopTaskWatchdog();
  const tick = () => {
    if (!taskActive) return stopTaskWatchdog();
    processNewMessages();
    taskWatchdogTimer = setTimeout(tick, 1000);
  };
  taskWatchdogTimer = setTimeout(tick, 1000);
}

async function sendAgentTask(text) {
  if (!executionEnabled) throw new Error('Side Panel에서 실행 허용을 먼저 켜세요.');
  if (taskActive) throw new Error('현재 작업이 실행 중입니다. 먼저 중지하거나 완료될 때까지 기다리세요.');
  const baseline = getLatestAssistantBubble();
  if (baseline) processed.add(bubbleKey(baseline));
  pendingReplies.clear();
  candidateText = '';
  candidateSince = 0;
  protocolRecoveryAttempts = 0;
  taskActive = true;
  startTaskWatchdog();
  const hadMode = agentMode || hasAgentBootstrap();
  try {
    agentMode = true;
    const message = hadMode ? taskPrompt(text) : `${bootstrapPrompt()}\n\n${taskPrompt(text)}`;
    await typeAndSendWithRetry(message, 'Side Panel 작업 요청');
    hideBootstrapBubble();
    registerAgentTab();
    pendingSkillPrompt = '';
    logEvent('info', 'Side Panel 작업을 ChatGPT에 전달했습니다.');
    return true;
  } catch (error) {
    taskActive = false;
    stopTaskWatchdog();
    if (!hadMode) agentMode = false;
    throw error;
  }
}

function ensureAgentMode() {
  if (agentMode || hasAgentBootstrap()) {
    agentMode = true;
    hideBootstrapBubble();
    registerAgentTab();
    return true;
  }
  return false;
}

function registerAgentTab() {
  if (!executionEnabled || !chrome.runtime?.id || !chrome.runtime.sendMessage) return;
  try {
    const response = chrome.runtime.sendMessage({ type: 'AGENT_REGISTER' });
    response?.catch?.(() => {});
  } catch (_) {}
}

function isPlaceholderCommand(command) {
  const value = String(command || '').trim();
  return /^(?:one|a)\s+PowerShell command\.?$/i.test(value) || /^(?:\.\.\.|…)$/.test(value);
}

async function sendToServer(command) {
  const cwd = await getCwd();
  const requestId = `req-${++sequence}`;
  if (isPlaceholderCommand(command)) {
    const stderr = 'The agent emitted a placeholder instead of a real PowerShell command. No command was executed.';
    logEvent('error', stderr);
    return { ok: false, requestId, exitCode: -2, stdout: '', stderr, timedOut: false, cwd, durationMs: 0, status: 'rejected' };
  }
  try {
    logEvent('skill', 'PowerShell 스킬 선택');
    logEvent('files', `작업 폴더 확인: ${cwd}`);
    logEvent('command', command);
    const resp = await fetch(`${SERVER_URL}/tools/run_powershell/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Token': AGENT_TOKEN },
      body: JSON.stringify({ sessionId: 'chatgpt-web', input: { command, cwd } }),
    });
    let data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'command submission failed');
    if (data.status === 'awaiting_approval') {
      logEvent('approval', `승인 대기 중: ${command}`, data.id);
      const approved = await fetch(`${SERVER_URL}/commands/${data.id}/approve`, { method: 'POST', headers: { 'X-Agent-Token': AGENT_TOKEN } });
      data = await approved.json();
    }
    const current = await fetch(`${SERVER_URL}/commands/${data.id}/wait`, { headers: { 'X-Agent-Token': AGENT_TOKEN } });
    data = await current.json();
    if (!current.ok) throw new Error(data.error || 'command wait failed');
    const result = data.result || { exitCode: data.status === 'completed' ? 0 : 1, stdout: '', stderr: data.error || data.status };
    const logOutput = result.outputFile ? String(result.stdout || result.stderr || '').slice(0, 3000) + `\n(full output: ${result.outputFile})` : (result.stdout || result.stderr || '');
    logEvent(result.exitCode === 0 ? 'result' : 'error', `tool: run_powershell\ncwd: ${data.cwd || cwd}\nstatus: ${data.status}\nexit code: ${result.exitCode}\nduration: ${data.durationMs || 0}ms\n${logOutput}`);
    return { ok: result.exitCode === 0, requestId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, outputFile: result.outputFile, outputId: result.outputId, timedOut: result.stopped === 'timeout', cwd: data.cwd || cwd, durationMs: data.durationMs, status: data.status };
  } catch (err) {
    const result = {
      ok: false,
      exitCode: -1,
      stdout: '',
      stderr: `Failed to reach local server (${SERVER_URL}). Is it running?\n${err?.message || err}`,
    };
    logEvent('error', result.stderr);
    return result;
  }
}

function getAssistantBubbles() {
  const roleBubbles = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  if (roleBubbles.length) return roleBubbles;
  return [...document.querySelectorAll('article')];
}

function getMessageBubbles() {
  return [...document.querySelectorAll('article, [data-message-author-role="assistant"]')]
    .filter((bubble) => bubble.getAttribute('data-message-author-role') !== 'user');
}

function getLatestAssistantBubble() {
  const roleBubbles = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  const bubbles = roleBubbles.length ? roleBubbles : [...document.querySelectorAll('article')];
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const text = bubbles[i].innerText || '';
    if ((text.includes('<TERMINAL>') && text.includes('</TERMINAL>')) || (text.includes('<TOOL>') && text.includes('</TOOL>'))) return bubbles[i];
  }
  if (bubbles.length) return bubbles[bubbles.length - 1];
  const pageText = document.body?.innerText || '';
  const markers = [...pageText.matchAll(/<(TERMINAL|TOOL)>/gi)];
  const marker = markers.at(-1);
  if (!marker) return null;
  const close = `</${marker[1]}>`;
  const end = pageText.indexOf(close, marker.index);
  if (end < 0) return null;
  const start = Math.max(0, marker.index - 1000);
  return { innerText: pageText.slice(start, end + close.length), getAttribute: () => null };
}

function extractToolCalls(text) {
  const calls = [];
  const re = /<TOOL>\s*([\s\S]*?)\s*<\/TOOL>/gi;
  let match;
  while ((match = re.exec(text))) {
    try {
      calls.push(JSON.parse(match[1]));
    } catch (error) {
      const known = ['github_status', 'docker_version'];
      const name = known.find((tool) => match[1].includes(tool));
      if (name) calls.push({ name, reason: '보정된 도구 호출', input: {} });
      else logEvent('error', `TOOL JSON 오류: ${error.message}`);
    }
  }
  return calls;
}

async function sendToolToServer(tool) {
  const cwd = await getCwd();
  const name = String(tool.name || '');
  const failure = (status, error) => ({ tool: name || 'unknown', status, result: null, error });
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return failure('unsupported', '잘못된 도구 이름입니다.');
  try {
    const response = await fetch(`${SERVER_URL}/tools/${name}/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': AGENT_TOKEN },
      body: JSON.stringify({ sessionId: 'chatgpt-web', input: { ...(tool.input || {}), cwd } }),
    });
    let data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const disabled = response.status === 404 && /^(browser_|computer_)/.test(name);
      return failure(disabled ? 'unsupported' : 'failed', disabled
        ? `Tool ${name} is disabled in this extension. Browser automation is not available; use supported local tools instead.`
        : (data.error || 'tool submission failed'));
    }
    logEvent(data.status === 'awaiting_approval' ? 'approval' : 'command', `Tool: ${name}\n${tool.reason || ''}`, data.id);
    if (data.status === 'awaiting_approval') {
      const approved = await fetch(`${SERVER_URL}/commands/${data.id}/approve`, { method: 'POST', headers: { 'X-Agent-Token': AGENT_TOKEN } });
      data = await approved.json().catch(() => ({}));
      if (!approved.ok) return failure('failed', data.error || 'tool approval failed');
    }
    const current = await fetch(`${SERVER_URL}/commands/${data.id}/wait`, { headers: { 'X-Agent-Token': AGENT_TOKEN } });
    data = await current.json().catch(() => ({}));
    if (!current.ok) return failure('failed', data.error || 'tool status lookup failed');
    return { tool: name, status: data.status, result: data.result || null, error: data.error || null };
  } catch (error) {
    return failure('failed', `Local tool server request failed: ${error.message}`);
  }
}

function hideProtocolBubble(bubble) {
  if (!bubble || bubble.getAttribute?.('data-message-author-role') === 'user') return;
  const text = bubble.innerText || '';
  if (!/<(?:AGENT_STATUS|AGENT_NOTE|SKILL|TERMINAL|TOOL)(?:\s|>)/i.test(text)) return;
  bubble.dataset.chatgptAgentProtocol = 'hidden';
  bubble.style.display = 'none';
}

function hideExistingProtocolBubbles() {
  getAssistantBubbles().forEach(hideProtocolBubble);
}

function readAgentMarkers(text) {
  const status = text.match(/<AGENT_STATUS>\s*([^<]+?)\s*<\/AGENT_STATUS>/i)?.[1]?.trim().toLowerCase();
  const skill = text.match(/<SKILL>\s*([^<]+?)\s*<\/SKILL>/i)?.[1]?.trim();
  const note = text.match(/<AGENT_NOTE>\s*([\s\S]*?)\s*<\/AGENT_NOTE>/i)?.[1]?.trim();
  const marker = `${status || ''}|${skill || ''}|${note || ''}`;
  if (marker && marker !== lastAgentMarker) {
    lastAgentMarker = marker;
    if (status) logEvent('status', status);
    if (skill) logEvent('skill', `활성 스킬: ${skill}`);
    if (note) logEvent('note', note);
  }
}

function getComposer() {
  const candidates = [
    document.querySelector('#prompt-textarea'),
    document.querySelector('textarea#prompt-textarea'),
    document.querySelector('textarea[placeholder*="Message" i]'),
    ...document.querySelectorAll('div[contenteditable="true"], div[contenteditable="false"][data-chatgpt-agent-original-aria], [role="textbox"][contenteditable="true"]'),
  ].filter(Boolean);
  const visible = candidates.find((candidate) => {
    if (candidate.disabled) return false;
    const rect = candidate.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  });
  return visible || candidates[0] || null;
}

function composerText(editor) {
  return editor.tagName === 'TEXTAREA' ? editor.value : (editor.innerText || editor.textContent || '');
}

function unlockComposer(editor) {
  if (!editor) return;
  if (editor.tagName === 'TEXTAREA') editor.readOnly = false;
  else editor.setAttribute('contenteditable', 'true');
  if (editor.dataset && Object.prototype.hasOwnProperty.call(editor.dataset, 'chatgptAgentOriginalAria')) {
    const original = editor.dataset.chatgptAgentOriginalAria;
    if (original) editor.setAttribute?.('aria-label', original);
    else editor.removeAttribute?.('aria-label');
    delete editor.dataset.chatgptAgentOriginalAria;
  }
}

function lockComposer(editor) {
  if (!editor) return;
  if (editor.dataset && !Object.prototype.hasOwnProperty.call(editor.dataset, 'chatgptAgentOriginalAria')) editor.dataset.chatgptAgentOriginalAria = editor.getAttribute?.('aria-label') || '';
  if (editor.tagName === 'TEXTAREA') editor.readOnly = true;
  else editor.setAttribute?.('contenteditable', 'false');
  editor.setAttribute?.('aria-label', 'Side Panel에서 작업을 입력하세요');
}

async function waitForComposerText(editor, text, timeout = 5000) {
  const expected = String(text).replace(/\s+/g, ' ').trim();
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const actual = composerText(editor).replace(/\s+/g, ' ').trim();
    if (actual && actual.includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('ChatGPT input did not accept the message');
}

function setContentEditableText(editor, text) {
  const selection = window.getSelection?.();
  const range = document.createRange?.();
  if (selection && range) {
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, text);
  } catch (_) {}

  const expected = String(text).replace(/\s+/g, ' ').trim();
  const actual = composerText(editor).replace(/\s+/g, ' ').trim();
  if (!inserted || !actual.includes(expected)) {
    if (range && document.createTextNode) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      editor.textContent = text;
    }
  }
  try {
    editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, data: text, inputType: 'insertText' }));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  } catch (_) {
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

async function waitForComposerClear(editor, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (!composerText(editor).trim()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function dispatchEnter(editor) {
  const options = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  editor.dispatchEvent(new KeyboardEvent('keydown', options));
  editor.dispatchEvent(new KeyboardEvent('keyup', options));
}

function getSendButton(editor) {
  const direct = document.querySelector('button[data-testid="send-button"], button[data-testid="composer-send-button"], button[data-testid*="send"], button[aria-label="Send"], button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="보내기"], button[aria-label*="전송"]');
  if (direct) return direct;
  const formButton = [...(editor.closest('form')?.querySelectorAll('button') || [])]
    .find((button) => button.type === 'submit' || /send|보내기/i.test(button.getAttribute('aria-label') || ''));
  if (formButton) return formButton;
  const visible = [...document.querySelectorAll('button')].filter((button) => {
    const box = button.getBoundingClientRect();
    const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.toLowerCase();
    return box.width > 20 && box.height > 20 && box.bottom > window.innerHeight - 180 && !/microphone|voice|attach|add photos|upload|create image|web search|deep research|data analytics|codex security|slack|cancel|stop|음성|마이크|사진|파일|첨부/.test(label);
  }).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
  return visible[0] || null;
}

async function typeAndSend(text) {
  const now = Date.now();
  if (sending) throw new Error('ChatGPT 전송이 이미 진행 중입니다.');
  if (text === lastSentText && now - lastSentAt < 5000) return;
  sending = true;
  let editor;
  try {
    editor = getComposer();
    if (!editor) throw new Error('ChatGPT input box not found');

    unlockComposer(editor);
    editor.focus();

    if (editor.tagName === 'TEXTAREA') {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(editor, text);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      setContentEditableText(editor, text);
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await waitForComposerText(editor, text);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const form = editor.closest('form');
    const sendButton = getSendButton(editor);
    if (sendButton && !sendButton.disabled) sendButton.click();
    if (await waitForComposerClear(editor)) {
      lastSentText = text;
      lastSentAt = Date.now();
      return;
    }

    if (form) {
      try { form.requestSubmit(); } catch (_) {}
      if (await waitForComposerClear(editor)) {
        lastSentText = text;
        lastSentAt = Date.now();
        return;
      }
    }

    dispatchEnter(editor);
    if (await waitForComposerClear(editor)) {
      lastSentText = text;
      lastSentAt = Date.now();
      return;
    }
    throw new Error('ChatGPT did not submit the message');
  } finally {
    lockComposer(editor);
    sending = false;
  }
}

async function typeAndSendWithRetry(text, label = 'ChatGPT 메시지') {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) logEvent('retry', `${label} 재시도 ${attempt}/3`);
      await typeAndSend(text);
      return true;
    } catch (error) {
      lastError = error;
      logEvent('error', `${label} 실패 ${attempt}/3: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

function extractCommands(text) {
  const results = [];
  let m;
  const re = new RegExp(COMMAND_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

async function processNewMessages() {
  resetConversationState();
  if (!executionEnabled || !taskActive) return;
  if (processing) {
    rerunRequested = true;
    return;
  }
  processing = true;
  try {
    if (!agentMode) {
      if (hasAgentBootstrap()) {
        agentMode = true;
      } else {
        return;
      }
    }
    const bubble = getLatestAssistantBubble();
    if (!bubble) return;
    const text = bubble.innerText || '';
    if (text) readAgentMarkers(text);
    if (/<AGENT_COMPLETE>[\s\S]*?<\/AGENT_COMPLETE>/i.test(text) || (/작업이 완료|작업을 완료|완료했습니다|task is complete|completed successfully/i.test(text) && !text.includes('<TERMINAL>'))) {
      const completionKey = `completed-${bubble.getAttribute('data-message-id') || `${text.length}:${text.slice(-120)}`}`;
      if (!processed.has(completionKey)) {
        processed.add(completionKey);
        logEvent('complete', text.slice(0, 1000));
      }
      hideProtocolBubble(bubble);
      taskActive = false;
      stopTaskWatchdog();
      protocolRecoveryAttempts = 0;
      return;
    }
    if (text !== candidateText) {
      candidateText = text;
      candidateSince = Date.now();
      setTimeout(processNewMessages, 1200);
      return;
    }
    if (Date.now() - candidateSince < 1000) return;
    const key = bubbleKey(bubble);
    if (processed.has(key)) return;

    const pending = pendingReplies.get(key);
    if (pending) {
      try {
        await typeAndSendWithRetry(pending.message, pending.label);
        pendingReplies.delete(key);
        processed.add(key);
        hideProtocolBubble(bubble);
      } catch (error) {
        logEvent('error', `${pending.label} 대기 중: ${error.message}`);
        setTimeout(processNewMessages, 3000);
      }
      return;
    }

    const commands = extractCommands(text);
    const tools = extractToolCalls(text);
    if (!commands.length && !tools.length) {
      if (protocolRecoveryAttempts >= 2) {
        logEvent('error', 'ChatGPT가 로컬 코딩 프로토콜을 사용하지 않았습니다. 이미지 생성이나 일반 응답은 실행하지 않습니다.');
        taskActive = false;
        stopTaskWatchdog();
        return;
      }
      protocolRecoveryAttempts += 1;
      const correction = `${LOCAL_CODING_DIRECTIVE}\nYour previous response did not contain a custom protocol call. Do not explain, generate an image, or use a native tool. Output exactly one custom <TOOL> JSON call for inspect_project or one real <TERMINAL> PowerShell command now.`;
      try {
        await typeAndSendWithRetry(correction, '로컬 코딩 프로토콜 재요청');
        processed.add(key);
      } catch (error) {
        logEvent('error', `프로토콜 재요청 실패: ${error.message}`);
      }
      return;
    }
    protocolRecoveryAttempts = 0;

    console.log('[agent] detected commands:', commands);
    logEvent('info', `명령 ${commands.length}개를 감지했습니다.`);
    const cmd = commands[0];
    if (cmd) {
      const result = await sendToServer(cmd);
      const message = buildResultMessage({
        requestId: result.requestId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        command: cmd,
        outputFile: result.outputFile,
        outputId: result.outputId,
      });
      console.log('[agent] injecting result for:', cmd);
      pendingReplies.set(key, { message, label: '터미널 결과 전달' });
      try {
        await typeAndSendWithRetry(message, '터미널 결과 전달');
        pendingReplies.delete(key);
        processed.add(key);
        hideProtocolBubble(bubble);
      } catch (error) {
        logEvent('error', `터미널 결과 전달 대기 중: ${error.message}`);
        setTimeout(processNewMessages, 3000);
        return;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    const tool = tools[0];
    if (tool && !cmd) {
      const result = await sendToolToServer(tool);
      logEvent(result.status === 'completed' ? 'result' : 'error', `tool: ${result.tool}\nstatus: ${result.status}\n${result.error || JSON.stringify(result.result || {}, null, 2)}`);
      const unavailable = result.status === 'unsupported' ? '\nThis tool is disabled in this extension. Do not call it again. Use supported local tools such as inspect_project, read_file, search_files, run_powershell, run_tests, or verify_project, or explain that browser verification is unavailable.' : '';
      const message = `<TOOL_RESULT>\n${JSON.stringify(result, null, 2)}\n</TOOL_RESULT>${unavailable}\nAnalyze this result. If it failed, explain why, choose a corrected action, and retry it. If complete, finish with <AGENT_COMPLETE>.`;
      pendingReplies.set(key, { message, label: '도구 결과 전달' });
      try {
        await typeAndSendWithRetry(message, '도구 결과 전달');
        pendingReplies.delete(key);
        processed.add(key);
        hideProtocolBubble(bubble);
      } catch (error) {
        logEvent('error', `도구 결과 전달 대기 중: ${error.message}`);
        setTimeout(processNewMessages, 3000);
        return;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  } catch (e) {
    console.error('[agent] error:', e);
  } finally {
    processing = false;
    if (rerunRequested) {
      rerunRequested = false;
      setTimeout(processNewMessages, 100);
    }
  }
}

const observer = new MutationObserver(() => {
  if (!executionEnabled) {
    unlockComposer(getComposer());
    return;
  }
  hideBootstrapBubble();
  lockComposer(getComposer());
  resetConversationState();
  clearTimeout(processNewMessages._t);
  processNewMessages._t = setTimeout(processNewMessages, 800);
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
setTimeout(() => {
  if (!executionEnabled) {
    unlockComposer(getComposer());
    return;
  }
  hideBootstrapBubble();
  hideExistingProtocolBubbles();
  lockComposer(getComposer());
  if (hasAgentBootstrap()) {
    agentMode = true;
  }
}, 1000);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoEnabled) processNewMessages();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXECUTION_STATE') {
    setExecutionEnabled(message.enabled);
    sendResponse({ ok: true, enabled: executionEnabled });
    return;
  }
  if (message?.type === 'STOP_AGENT') {
    taskActive = false;
    stopTaskWatchdog();
    protocolRecoveryAttempts = 0;
    pendingReplies.clear();
    rerunRequested = false;
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === 'AGENT_HEARTBEAT') {
    const active = executionEnabled && taskActive && (agentMode || hasAgentBootstrap());
    if (active) processNewMessages();
    sendResponse({ ok: true, active });
    return;
  }
  if (message?.type === 'SEND_USER_MESSAGE') {
    sendAgentTask(message.text).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'RETRY_COMMAND') {
    (async () => {
      try {
        if (!executionEnabled) throw new Error('Side Panel에서 실행 허용을 먼저 켜세요.');
        if (!ensureAgentMode()) throw new Error('Side Panel에서 먼저 작업을 시작하세요.');
        const baseline = getLatestAssistantBubble();
        if (baseline) processed.add(bubbleKey(baseline));
        taskActive = true;
        startTaskWatchdog();
        const result = await sendToServer(message.command);
        await typeAndSendWithRetry(buildResultMessage({ ...result, command: message.command }), '재시도 결과 전달');
        sendResponse({ ok: true });
      } catch (error) {
        logEvent('error', `재시도 실패: ${error.message}`);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }
  if (message?.type === 'APPLY_SKILL') {
    if (!executionEnabled) {
      sendResponse({ ok: false, error: 'Side Panel에서 실행 허용을 먼저 켜세요.' });
      return;
    }
    pendingSkillPrompt = `<AGENT_STATUS>skills</AGENT_STATUS>\n<SKILL>${message.skill}</SKILL>\n<SKILL_INSTRUCTIONS>\n${message.content || 'Use the selected skill and follow the agent protocol.'}\n</SKILL_INSTRUCTIONS>`;
    logEvent('skill', `Side Panel 스킬 선택: ${message.skill}`);
    sendResponse({ ok: true });
    return;
  }
  if (message?.type !== 'START_AGENT') return;
  if (!executionEnabled) {
    sendResponse({ ok: false, error: 'Side Panel에서 실행 허용을 먼저 켜세요.' });
    return;
  }
  if (hasAgentBootstrap()) agentMode = true;
  registerAgentTab();
  logEvent('info', 'Side Panel 작업 입력을 기다립니다. ChatGPT 직접 입력은 처리하지 않습니다.');
  sendResponse({ ok: true, armed: true });
});

console.log('[ChatGPT Terminal Agent] content script loaded');
logEvent('info', 'ChatGPT 연결 준비 완료');
requestExecutionState();
