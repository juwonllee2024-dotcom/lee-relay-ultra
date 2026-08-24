const SERVER = 'http://localhost:5747';
const events = document.getElementById('events');
const status = document.getElementById('status');
const steps = ['planning', 'skills', 'files', 'approval', 'running', 'analyzing', 'fixing', 'testing', 'completed'];
const AGENT_TOKEN = 'chatgpt-agent-local-v1';
let currentStep = 'planning';
let lastCommand = '';
let eventTotal = 0;
let skillCatalog = {};
let activeTabId = null;
let executionEnabled = false;
const CHATGPT_HOSTS = new Set(['chatgpt.com', 'chat.openai.com']);

function isChatGPTTab(tab) {
  try {
    const url = new URL(tab?.url || '');
    return url.protocol === 'https:' && CHATGPT_HOSTS.has(url.hostname);
  } catch (_) {
    return false;
  }
}

async function getActiveChatGPTTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다.');
  if (!isChatGPTTab(tab)) throw new Error('ChatGPT 탭을 활성화한 뒤 다시 시도하세요.');
  return tab;
}

function setExecutionUI(enabled, tabLabel = '') {
  executionEnabled = Boolean(enabled);
  const gate = document.getElementById('executionGate');
  const toggle = document.getElementById('executionToggle');
  const state = document.getElementById('executionState');
  const label = document.getElementById('executionToggleLabel');
  const tab = document.getElementById('executionTab');
  gate.classList.toggle('enabled', executionEnabled);
  toggle.setAttribute('aria-pressed', String(executionEnabled));
  toggle.disabled = !activeTabId;
  label.textContent = executionEnabled ? 'ON' : 'OFF';
  state.textContent = executionEnabled ? '실행 허용됨' : '실행 잠금';
  tab.textContent = activeTabId ? (executionEnabled ? `현재 탭에서만 실행: ${tabLabel || 'ChatGPT'}` : `현재 탭에서 실행이 꺼져 있습니다.`) : 'ChatGPT 탭을 활성화하세요.';
  document.getElementById('welcome').hidden = executionEnabled;
  for (const id of ['sendTask', 'stopAgent', 'readTxt', 'exportTxt', 'skillInput']) {
    const element = document.getElementById(id);
    if (element) element.disabled = !executionEnabled;
  }
  document.querySelectorAll('.execution-action').forEach((element) => { element.disabled = !executionEnabled; });
}

async function loadExecutionState() {
  try {
    const tab = await getActiveChatGPTTab();
    activeTabId = tab.id;
    const state = await chrome.runtime.sendMessage({ type: 'GET_EXECUTION_STATE', tabId: tab.id });
    if (!state?.ok) throw new Error(state?.error || '실행 상태를 확인할 수 없습니다.');
    setExecutionUI(state.enabled, new URL(tab.url).pathname);
  } catch (error) {
    activeTabId = null;
    setExecutionUI(false);
    document.getElementById('executionTab').textContent = tabErrorMessage(error);
  }
}

async function requireExecutionForActiveTab() {
  const tab = await getActiveChatGPTTab();
  const state = await chrome.runtime.sendMessage({ type: 'GET_EXECUTION_STATE', tabId: tab.id });
  activeTabId = tab.id;
  setExecutionUI(Boolean(state?.enabled), new URL(tab.url).pathname);
  if (!state?.ok || !state.enabled) throw new Error('현재 탭에서 실행 허용을 먼저 켜세요.');
  return tab;
}

async function sendTabMessage(tabId, message, canInject = true) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) return reject(new Error(error.message));
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  }).catch(async (error) => {
    if (!canInject || !String(error?.message || error).includes('Receiving end does not exist')) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return sendTabMessage(tabId, message, false);
  });
}

function tabErrorMessage(error) {
  const message = String(error?.message || error);
  if (message.includes('Receiving end does not exist')) return 'ChatGPT 탭을 새로고침한 뒤 다시 시도하세요.';
  return message;
}

async function runLocalTool(tool, input) {
  await requireExecutionForActiveTab();
  const response = await fetch(`${SERVER}/tools/${tool}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Token': AGENT_TOKEN },
    body: JSON.stringify({ sessionId: 'sidepanel', input }),
  });
  let data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${tool} 요청 실패`);
  if (data.status === 'awaiting_approval') {
    data = await (await fetch(`${SERVER}/commands/${data.id}/approve`, { method: 'POST', headers: { 'X-Agent-Token': AGENT_TOKEN } })).json();
  }
  const current = await fetch(`${SERVER}/commands/${data.id}/wait`, { headers: { 'X-Agent-Token': AGENT_TOKEN } });
  data = await current.json().catch(() => ({}));
  if (!current.ok) throw new Error(data.error || `${tool} 상태 확인 실패`);
  return data;
}

function setStep(step) {
  if (!steps.includes(step)) return;
  currentStep = step;
  const labels = { planning: '계획 중', skills: '스킬 선택 중', files: '파일 확인 중', approval: '명령 준비 중', running: '도구 실행 중', analyzing: '결과 분석 중', fixing: '오류 수정 중', testing: '테스트 중', completed: '작업 완료' };
  document.getElementById('liveLabel').textContent = labels[step] || step;
  document.getElementById('liveTime').textContent = new Date().toLocaleTimeString();
  const current = steps.indexOf(step);
  document.querySelectorAll('.step').forEach((node) => {
    const index = steps.indexOf(node.dataset.step);
    node.classList.toggle('active', index === current);
    node.classList.toggle('done', index < current);
  });
}

function stepForEvent(kind, text) {
  const value = String(text || '').toLowerCase();
  if (kind === 'status') return ({ planning: 'planning', skills: 'skills', files: 'files', approval: 'approval', running: 'running', analyzing: 'analyzing', fixing: 'fixing', testing: 'testing', completed: 'completed' })[value] || currentStep;
  if (kind === 'approval') return 'approval';
  if (kind === 'skill') return 'skills';
  if (kind === 'files') return 'files';
  if (kind === 'command') return /test|build|lint|check/.test(value) ? 'testing' : 'running';
  if (kind === 'result') return 'analyzing';
  if (kind === 'error' || kind === 'retry') return 'fixing';
   if (kind === 'complete') return 'completed';
  return kind === 'info' ? 'planning' : currentStep;
}

function addEvent(kind, text, commandId) {
  eventTotal += 1;
  document.getElementById('eventCount').textContent = `${eventTotal} events`;
  document.getElementById('liveTask').textContent = String(text || '').split('\n')[0].slice(0, 140) || '작업을 준비하는 중입니다.';
  if (kind === 'command') document.getElementById('toolLabel').textContent = text.startsWith('Tool:') ? text.split('\n')[0] : 'Windows PowerShell';
  if (kind === 'result') document.getElementById('toolLabel').textContent = '결과 수신 완료';
  setStep(stepForEvent(kind, text));
  const item = document.createElement('article');
  item.className = `event ${kind}`;
  const stage = { command: '실행 중', approval: '명령 준비', result: '결과 분석 중', error: '오류 수정 필요', retry: '재시도 중', info: '계획/정보', skill: '스킬 선택', files: '파일 확인', status: '에이전트 상태', note: '진행 설명', complete: '완료' }[kind] || kind;
  item.innerHTML = `<div class="meta"><span>${new Date().toLocaleTimeString()} · ${stage}</span><b>${kind.toUpperCase()}</b></div>`;
  const body = document.createElement('div');
  body.textContent = text;
  item.appendChild(body);
  item.ondblclick = () => item.classList.toggle('expanded');
  if (kind === 'command') lastCommand = text.split('\n')[0].trim();
  if (kind === 'error' && lastCommand) {
    const retry = document.createElement('button');
    retry.textContent = '다시 시도';
    retry.onclick = async () => {
      retry.disabled = true;
      retry.textContent = '재시도 중...';
      try {
        const tab = await getActiveChatGPTTab();
        const response = await sendTabMessage(tab.id, { type: 'RETRY_COMMAND', command: lastCommand });
        if (!response?.ok) throw new Error(response?.error || '명령 재시도에 실패했습니다.');
        retry.textContent = '재시도 완료';
      } catch (error) {
        retry.disabled = false;
        retry.textContent = '다시 시도';
        addEvent('error', tabErrorMessage(error));
      }
    };
    item.append(' ', retry);
  }
  events.prepend(item);
}

function load() {
  chrome.storage.local.get(['cwd', 'autoEnabled', 'agentEvents', 'agentActive'], (data) => {
    document.getElementById('cwd').value = data.cwd || '';
    document.getElementById('consolePath').textContent = data.cwd || 'workspace not set';
    const history = data.agentEvents || [];
    document.getElementById('welcome').hidden = executionEnabled;
    for (const event of history.slice(-50)) addEvent(event.kind, event.text, event.commandId);
  });
}

document.getElementById('save').onclick = () => {
  const cwd = document.getElementById('cwd').value.trim();
  document.getElementById('consolePath').textContent = cwd || 'workspace not set';
  chrome.storage.local.set({ cwd }, () => addEvent('info', '설정을 저장했습니다.'));
};
document.getElementById('executionToggle').onclick = async () => {
  try {
    const tab = await getActiveChatGPTTab();
    activeTabId = tab.id;
    const enabled = !executionEnabled;
    const result = await chrome.runtime.sendMessage({ type: 'SET_EXECUTION_ENABLED', tabId: tab.id, enabled });
    if (!result?.ok) throw new Error(result?.error || '실행 상태 변경에 실패했습니다.');
    setExecutionUI(enabled, new URL(tab.url).pathname);
    chrome.storage.local.set({ agentActive: enabled });
    document.getElementById('welcome').hidden = enabled;
    addEvent('info', enabled ? '현재 탭에서 실행 허용을 켰습니다.' : '현재 탭의 실행을 잠갔습니다.');
  } catch (error) {
    addEvent('error', tabErrorMessage(error));
  }
};
document.getElementById('stopAgent').onclick = async () => {
  const response = await fetch(`${SERVER}/sessions/chatgpt-web/stop`, { method: 'POST', headers: { 'X-Agent-Token': 'chatgpt-agent-local-v1' } });
  const result = await response.json();
  chrome.storage.local.set({ agentActive: executionEnabled });
  try {
    const tab = await requireExecutionForActiveTab();
    await sendTabMessage(tab.id, { type: 'STOP_AGENT' });
  } catch (_) {}
  addEvent('info', `세션 중지: ${result.stopped || 0}개 명령`);
};
document.getElementById('sendTask').onclick = async () => {
  const input = document.getElementById('taskInput');
  const text = input.value.trim();
  if (!text) return;
  if (!executionEnabled) return addEvent('error', '현재 탭에서 실행 허용을 먼저 켜세요.');
  const button = document.getElementById('sendTask');
  button.disabled = true;
  addEvent('info', `사용자 요청: ${text}`);
  try {
    const tab = await requireExecutionForActiveTab();
    const response = await sendTabMessage(tab.id, { type: 'SEND_USER_MESSAGE', text });
    if (!response?.ok) throw new Error(response?.error || '작업 요청 전송에 실패했습니다.');
    input.value = '';
  } catch (error) {
    addEvent('error', tabErrorMessage(error));
  } finally {
    button.disabled = false;
  }
};
document.getElementById('taskInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('sendTask').click(); } });
document.getElementById('skillInput').addEventListener('change', (event) => {
  const value = event.target.value.trim();
  if (value.startsWith('@')) {
    if (!executionEnabled) return addEvent('error', '현재 탭에서 실행 허용을 먼저 켜세요.');
    addEvent('skill', `${value} 스킬 선택`);
    (async () => {
      try {
        const tab = await requireExecutionForActiveTab();
        const response = await sendTabMessage(tab.id, { type: 'APPLY_SKILL', skill: value, content: skillCatalog[value.replace(/^@/, '')] || '' });
        if (!response?.ok) throw new Error(response?.error || '스킬 전달에 실패했습니다.');
      } catch (error) {
        addEvent('error', tabErrorMessage(error));
      }
    })();
  }
});
document.getElementById('readTxt').onclick = async () => {
  const input = document.getElementById('txtPath');
  const output = document.getElementById('txtContent');
  const button = document.getElementById('readTxt');
  const cwd = document.getElementById('cwd').value.trim();
  const filePath = input.value.trim();
  if (!filePath) return addEvent('error', '읽을 TXT 경로를 입력하세요.');
  button.disabled = true;
  try {
    const command = await runLocalTool('read_text_file', { cwd, path: filePath });
    if (command.status !== 'completed') throw new Error(command.error || 'TXT 읽기에 실패했습니다.');
    output.value = command.result?.content || '';
    addEvent('result', `TXT 읽기 완료: ${command.result.path}${command.result.truncated ? ' (전체 내용은 결과 파일에 저장됨)' : ''}`);
  } catch (error) {
    addEvent('error', error.message);
  } finally {
    button.disabled = false;
  }
};
document.getElementById('exportTxt').onclick = async () => {
  const output = document.getElementById('txtContent');
  const name = document.getElementById('txtName').value.trim() || 'export.txt';
  const button = document.getElementById('exportTxt');
  if (!output.value) return addEvent('error', '내보낼 TXT 내용이 없습니다.');
  button.disabled = true;
  try {
    const command = await runLocalTool('export_text_file', { cwd: document.getElementById('cwd').value.trim(), filename: name, content: output.value });
    if (command.status !== 'completed') throw new Error(command.error || 'TXT 내보내기에 실패했습니다.');
    addEvent('result', `TXT 내보내기 완료: ${command.result.filename}`);
    loadExports();
  } catch (error) {
    addEvent('error', error.message);
  } finally {
    button.disabled = false;
  }
};
document.getElementById('clear').onclick = () => {
  events.replaceChildren();
  document.getElementById('welcome').hidden = false;
  setStep('planning');
  chrome.storage.local.set({ agentEvents: [], agentActive: false });
};
chrome.storage.onChanged.addListener((changes) => { if (changes.agentEvents) { const list = changes.agentEvents.newValue || []; const last = list[list.length - 1]; if (last) addEvent(last.kind, last.text, last.commandId); } });
fetch(`${SERVER}/health`).then((r) => r.json()).then(() => { status.textContent = '서버 연결됨'; }).catch(() => { status.textContent = '서버 꺼짐'; status.style.color = '#ff9b9b'; });
fetch(`${SERVER}/skills`).then((r) => r.json()).then((data) => {
  skillCatalog = Object.fromEntries((data.skills || []).map((skill) => [skill.name, skill.content]));
  document.getElementById('skillOptions').innerHTML = (data.skills || []).map((skill) => `<option value="@${skill.name}">${skill.description || skill.name}</option>`).join('');
}).catch(() => {});
fetch(`${SERVER}/plugins`).then((r) => r.json()).then((data) => {
  document.getElementById('plugins').textContent = `플러그인: ${(data.plugins || []).map((plugin) => '@' + plugin.name).join(', ') || '없음'}`;
}).catch(() => {});
async function loadExports() {
  try {
    const data = await (await fetch(`${SERVER}/exports`, { headers: { 'X-Agent-Token': AGENT_TOKEN } })).json();
    const list = document.getElementById('txtExports');
    list.replaceChildren();
    if (!data.exports?.length) { list.textContent = '내보낸 TXT 없음'; return; }
    for (const item of data.exports.slice(0, 10)) {
      const row = document.createElement('div'); row.className = 'txt-export-row';
      const label = document.createElement('span'); label.textContent = item.filename;
      const download = document.createElement('button'); download.className = 'execution-action'; download.disabled = !executionEnabled; download.textContent = 'DOWNLOAD';
      download.onclick = async () => {
        if (!executionEnabled) return addEvent('error', '현재 탭에서 실행 허용을 먼저 켜세요.');
        download.disabled = true;
        try {
          const response = await fetch(`${SERVER}/exports/${item.exportId}/download`, { headers: { 'X-Agent-Token': AGENT_TOKEN } });
          if (!response.ok) throw new Error('TXT 다운로드에 실패했습니다.');
          const link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = item.filename; link.click(); URL.revokeObjectURL(link.href);
        } catch (error) { addEvent('error', error.message); } finally { download.disabled = false; }
      };
      row.append(label, download); list.appendChild(row);
    }
  } catch (_) {}
}
async function loadChanges() {
  try {
    const data = await (await fetch(`${SERVER}/changes`)).json();
    document.getElementById('changeCount').textContent = `${data.changes.length}`;
    const list = document.getElementById('changesList');
    list.replaceChildren();
    if (!data.changes.length) { list.textContent = '변경 백업 없음'; return; }
    for (const change of data.changes.slice(0, 20)) {
      const row = document.createElement('div'); row.className = 'change-row';
      const label = document.createElement('span'); label.textContent = change.path;
      const diff = document.createElement('button'); diff.className = 'execution-action'; diff.disabled = !executionEnabled; diff.textContent = 'DIFF';
      diff.onclick = async () => {
        if (!executionEnabled) return addEvent('error', '현재 탭에서 실행 허용을 먼저 켜세요.');
        const response = await fetch(`${SERVER}/changes/${change.backupId}/diff`);
        const data = await response.json();
        const detail = document.createElement('pre'); detail.className = 'diff-detail';
        detail.textContent = `--- BEFORE ---\n${data.before || '(file did not exist)'}\n\n+++ AFTER +++\n${data.after || '(file removed)'}`;
        if (!row.nextElementSibling?.classList.contains('diff-detail')) row.after(detail); else row.nextElementSibling.remove();
      };
      const rollback = document.createElement('button'); rollback.className = 'execution-action'; rollback.disabled = !executionEnabled; rollback.textContent = 'ROLLBACK';
      rollback.onclick = async () => { if (!executionEnabled) return addEvent('error', '현재 탭에서 실행 허용을 먼저 켜세요.'); rollback.disabled = true; const response = await fetch(`${SERVER}/changes/${change.backupId}/rollback`, { method: 'POST', headers: { 'X-Agent-Token': 'chatgpt-agent-local-v1' } }); rollback.textContent = response.ok ? 'DONE' : 'FAIL'; };
      row.append(label, diff, rollback); list.appendChild(row);
    }
  } catch (_) {}
}
setExecutionUI(false);
load();
loadExecutionState();
loadChanges();
loadExports();
setInterval(loadChanges, 5000);
setInterval(loadExports, 5000);
chrome.tabs.onActivated.addListener(() => { loadExecutionState(); });
