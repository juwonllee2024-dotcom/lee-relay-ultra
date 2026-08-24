const SERVER_URL = 'http://localhost:5747';
const AGENT_TOKEN = 'chatgpt-agent-local-v1';
const HEARTBEAT_ALARM = 'chatgpt-agent-heartbeat';
const HEARTBEAT_PERIOD_MINUTES = 0.5;
const executionStorage = chrome.storage.session || chrome.storage.local;
const EXECUTION_TAB_KEY = 'executionTabIds';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  scheduleHeartbeat();
});
chrome.runtime.onStartup.addListener(scheduleHeartbeat);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) heartbeat().catch(() => {});
});

async function scheduleHeartbeat() {
  await chrome.alarms.create(HEARTBEAT_ALARM, { delayInMinutes: HEARTBEAT_PERIOD_MINUTES, periodInMinutes: HEARTBEAT_PERIOD_MINUTES });
}

async function getAgentTabIds() {
  const { agentTabIds = [] } = await chrome.storage.local.get({ agentTabIds: [] });
  return agentTabIds.filter((tabId) => Number.isInteger(tabId));
}

async function setAgentTabIds(tabIds) {
  await chrome.storage.local.set({ agentTabIds: [...new Set(tabIds)] });
}

async function getExecutionTabIds() {
  const { [EXECUTION_TAB_KEY]: tabIds = [] } = await executionStorage.get({ [EXECUTION_TAB_KEY]: [] });
  return tabIds.filter((tabId) => Number.isInteger(tabId));
}

async function setExecutionTabIds(tabIds) {
  await executionStorage.set({ [EXECUTION_TAB_KEY]: [...new Set(tabIds)] });
}

function isChatGPTTab(tab) {
  try {
    const url = new URL(tab?.url || '');
    return url.protocol === 'https:' && (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com');
  } catch (_) {
    return false;
  }
}

async function sendExecutionState(tabId, enabled) {
  const message = { type: 'EXECUTION_STATE', enabled: Boolean(enabled) };
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const tab = await chrome.tabs.get(tabId);
    if (!isChatGPTTab(tab)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

async function heartbeat() {
  const enabledTabIds = new Set(await getExecutionTabIds());
  const tabIds = (await getAgentTabIds()).filter((tabId) => enabledTabIds.has(tabId));
  const results = await Promise.all(tabIds.map(async (tabId) => {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'AGENT_HEARTBEAT' });
      return true;
    } catch (_) {
      return false;
    }
  }));
  const liveTabIds = tabIds.filter((_tabId, index) => results[index]);
  if (liveTabIds.length !== tabIds.length) await setAgentTabIds(liveTabIds);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'GET_EXECUTION_STATE') {
    const tabId = Number.isInteger(msg.tabId) ? msg.tabId : sender.tab?.id;
    getExecutionTabIds().then((tabIds) => sendResponse({ ok: true, tabId, enabled: tabIds.includes(tabId) })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (msg?.type === 'SET_EXECUTION_ENABLED' && Number.isInteger(msg.tabId)) {
    (async () => {
      const tab = await chrome.tabs.get(msg.tabId);
      if (!isChatGPTTab(tab)) throw new Error('ChatGPT 탭에서만 실행할 수 있습니다.');
      const tabIds = await getExecutionTabIds();
      const next = msg.enabled ? [...tabIds, msg.tabId] : tabIds.filter((tabId) => tabId !== msg.tabId);
      await setExecutionTabIds(next);
      if (!msg.enabled) {
        const agentTabIds = await getAgentTabIds();
        await setAgentTabIds(agentTabIds.filter((tabId) => tabId !== msg.tabId));
      }
      await sendExecutionState(msg.tabId, msg.enabled);
      sendResponse({ ok: true, tabId: msg.tabId, enabled: Boolean(msg.enabled) });
    })().catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (msg?.type === 'AGENT_REGISTER' && Number.isInteger(sender.tab?.id)) {
    getAgentTabIds()
      .then((tabIds) => setAgentTabIds([...tabIds, sender.tab.id]))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getAgentTabIds().then((tabIds) => setAgentTabIds(tabIds.filter((id) => id !== tabId))).catch(() => {});
  getExecutionTabIds().then((tabIds) => setExecutionTabIds(tabIds.filter((id) => id !== tabId))).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && !isChatGPTTab(tab)) {
    getExecutionTabIds().then((tabIds) => setExecutionTabIds(tabIds.filter((id) => id !== tabId))).catch(() => {});
    getAgentTabIds().then((tabIds) => setAgentTabIds(tabIds.filter((id) => id !== tabId))).catch(() => {});
  }
});

scheduleHeartbeat().catch(() => {});

async function getCwd() {
  const { cwd } = await chrome.storage.local.get('cwd');
  return cwd || '';
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'EXEC_COMMAND') {
    (async () => {
      const cwd = await getCwd();
      try {
        const resp = await fetch(`${SERVER_URL}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Agent-Token': AGENT_TOKEN },
          body: JSON.stringify({
            command: msg.command,
            cwd,
            requestId: msg.requestId,
          }),
        });
        const data = await resp.json();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true; // async response
  }
});
