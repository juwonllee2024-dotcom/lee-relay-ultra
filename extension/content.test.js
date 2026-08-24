const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
const promptSource = fs.readFileSync(path.join(__dirname, 'shared', 'ultra-prompt.js'), 'utf8');
const protocolSource = fs.readFileSync(path.join(__dirname, 'shared', 'ultra-protocol.js'), 'utf8');
const sidePanelSource = fs.readFileSync(path.join(__dirname, 'sidepanel.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

function createHarness({ buttonSubmits = true, useFormSubmitButton = false, contentEditable = false, fetchImpl, executionEnabled = true } = {}) {
  let messageListener;
  let observerCallback;
  let requestSubmitCount = 0;
  const storage = { agentEvents: [] };
  const assistantBubbles = [];
  const sentMessages = [];

  function submitEditor() {
    sentMessages.push(editor.value ?? editor.innerText);
    if (editor.tagName === 'TEXTAREA') editor.value = '';
    else {
      editor.innerText = '';
      editor.textContent = '';
    }
  }

  function bubble(text) {
    return { innerText: text, dataset: {}, style: {}, getAttribute: () => 'assistant-message' };
  }

  class FakeTextArea {
    constructor() {
      this.tagName = 'TEXTAREA';
      this._value = '';
    }

    get value() {
      return this._value;
    }

    set value(value) {
      this._value = String(value);
    }

    focus() {}
    dispatchEvent() {}
    closest() {
      return form;
    }
  }

  class FakeContentEditable {
    constructor() {
      this.tagName = 'DIV';
      this.innerText = '';
      this.textContent = '';
      this.dataset = {};
    }

    focus() {}
    dispatchEvent() {}
    closest() {
      return form;
    }
    getBoundingClientRect() {
      return { width: 400, height: 40 };
    }
    setAttribute(name, value) {
      this[name] = String(value);
    }
    getAttribute(name) {
      return this[name] || '';
    }
  }

  const editor = contentEditable ? new FakeContentEditable() : new FakeTextArea();
  const form = {
    querySelectorAll() {
      if (useFormSubmitButton) return [attachmentButton, formSubmitButton];
      return [button];
    },
    requestSubmit() {
      requestSubmitCount += 1;
      submitEditor();
    },
  };
  const button = {
    type: 'button',
    disabled: false,
    click() {
      if (buttonSubmits) submitEditor();
    },
  };
  const attachmentButton = { type: 'button', getAttribute: () => 'Add photos & files', click() { throw new Error('attachment button was clicked'); } };
  const formSubmitButton = { type: 'submit', disabled: false, getAttribute: () => 'Send', click() { submitEditor(); } };
  const document = {
    body: {},
    querySelector(selector) {
      if (selector.startsWith('#prompt-textarea')) return editor;
      if (selector.startsWith('button')) return useFormSubmitButton ? null : button;
      return null;
    },
    querySelectorAll(selector = '') {
      if (selector.includes('data-message-author-role') || selector.includes('article')) return assistantBubbles;
      return [];
    },
    execCommand(command, _show, value) {
      if (contentEditable && command === 'insertText') {
        editor.innerText = String(value);
        editor.textContent = String(value);
      }
      return true;
    },
  };
  const chrome = {
    runtime: {
      id: 'test-extension',
      lastError: null,
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
    storage: {
      local: {
        get(key, callback) {
          const result = typeof key === 'string' ? { [key]: storage[key] } : { ...key, ...storage };
          callback(result);
        },
        set(value, callback) {
          Object.assign(storage, value);
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
  };
  class FakeEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  const context = {
    chrome,
    document,
    window: { HTMLTextAreaElement: FakeTextArea },
    Event: FakeEvent,
    InputEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
    fetch: fetchImpl || (async () => { throw new Error('fetch should not be called'); }),
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(promptSource, context, { filename: 'shared/ultra-prompt.js' });
  vm.runInNewContext(protocolSource, context, { filename: 'shared/ultra-protocol.js' });
  vm.runInNewContext(source, context, { filename: 'content.js' });
  if (executionEnabled) messageListener({ type: 'EXECUTION_STATE', enabled: true }, {}, () => {});

  return {
    send(message) {
      return new Promise((resolve) => {
        assert.equal(messageListener(message, {}, resolve), true);
      });
    },
    stop() {
      messageListener({ type: 'STOP_AGENT' }, {}, () => {});
    },
    setAssistantText(text) {
      assistantBubbles.splice(0, assistantBubbles.length, bubble(text));
    },
    notify() {
      observerCallback?.();
    },
    sentMessages,
    editor,
    get requestSubmitCount() {
      return requestSubmitCount;
    },
  };
}

test('content script confirms a normal ChatGPT send', async () => {
  const harness = createHarness();
  const response = await harness.send({ type: 'SEND_USER_MESSAGE', text: 'run the tests' });

  assert.equal(response.ok, true);
  assert.equal(harness.editor.value, '');
  assert.equal(harness.requestSubmitCount, 0);
  harness.stop();
});

test('content script accepts and sends through the current contenteditable composer', async () => {
  const harness = createHarness({ contentEditable: true });
  const response = await harness.send({ type: 'SEND_USER_MESSAGE', text: 'use the current composer' });

  assert.equal(response.ok, true);
  assert.equal(harness.editor.innerText, '');
  assert.ok(harness.sentMessages.some((message) => message.includes('use the current composer')));
  harness.stop();
});

test('content script rejects all agent work while execution is off', async () => {
  const harness = createHarness({ executionEnabled: false });
  const response = await harness.send({ type: 'SEND_USER_MESSAGE', text: 'should not execute' });

  assert.equal(response.ok, false);
  assert.match(response.error, /실행 허용/);
  assert.equal(harness.sentMessages.length, 0);
});

test('content script falls back to form submission when button click is ineffective', async () => {
  const harness = createHarness({ buttonSubmits: false });
  const response = await harness.send({ type: 'SEND_USER_MESSAGE', text: 'verify the project' });

  assert.equal(response.ok, true);
  assert.equal(harness.editor.value, '');
  assert.equal(harness.requestSubmitCount, 1);
  harness.stop();
});

test('content script ignores the attachment button and selects a form submit button', async () => {
  const harness = createHarness({ useFormSubmitButton: true });
  const response = await harness.send({ type: 'SEND_USER_MESSAGE', text: 'continue testing' });

  assert.equal(response.ok, true);
  assert.equal(harness.editor.value, '');
  assert.equal(harness.requestSubmitCount, 0);
  harness.stop();
});

test('content script re-prompts when ChatGPT returns a non-protocol response', async () => {
  const harness = createHarness();
  await harness.send({ type: 'SEND_USER_MESSAGE', text: 'build the local website' });
  const initialCount = harness.sentMessages.length;
  harness.setAssistantText('I will generate an image for the website.');
  harness.notify();
  await new Promise((resolve) => setTimeout(resolve, 3200));

  assert.ok(harness.sentMessages.slice(initialCount).some((message) => message.includes('Never use native image generation')));
  harness.stop();
});

test('side panel guards messages to ChatGPT tabs', () => {
  assert.match(sidePanelSource, /function isChatGPTTab\(tab\)/);
  assert.match(sidePanelSource, /if \(!isChatGPTTab\(tab\)\)/);
  assert.match(sidePanelSource, /Receiving end does not exist/);
  assert.equal((sidePanelSource.match(/chrome\.tabs\.sendMessage/g) || []).length, 1);
  assert.match(sidePanelSource, /chrome\.scripting\.executeScript/);
  assert.match(sidePanelSource, /agentActive/);
  assert.match(sidePanelSource, /welcome'\)\.hidden/);
  assert.match(sidePanelSource, /executionToggle/);
  assert.match(sidePanelSource, /SET_EXECUTION_ENABLED/);
  assert.match(sidePanelSource, /GET_EXECUTION_STATE/);
});

test('legacy disabled tools return a result instead of blocking the agent loop', () => {
  assert.match(source, /response\.status === 404/);
  assert.match(source, /Browser automation is not available/);
});

test('side panel owns task activation and ignores old ChatGPT messages', () => {
  assert.match(source, /AGENT_BOOTSTRAP_MARKER/);
  assert.match(source, /let taskActive = false/);
  assert.match(source, /function sendAgentTask/);
  assert.match(source, /The user task from the Side Panel is/);
  assert.match(source, /ensureAgentMode/);
  assert.match(source, /ChatGPT 직접 입력은 처리하지 않습니다/);
  assert.match(source, /hideBootstrapBubble/);
  assert.match(source, /document\.body\?\.textContent/);
});

test('local coding tasks reject native image generation and recover missing protocol responses', () => {
  assert.match(source, /Never use native image generation/);
  assert.match(source, /protocolRecoveryAttempts/);
  assert.match(source, /로컬 코딩 프로토콜 재요청/);
});

test('placeholder terminal commands are rejected without reaching the server', () => {
  assert.match(source, /isPlaceholderCommand/);
  assert.match(source, /one PowerShell command/);
  assert.match(source, /\.\.\.|…/);
  assert.match(source, /No command was executed/);
});

test('command completion waits on the server instead of browser polling', () => {
  assert.match(source, /commands\/\$\{data\.id\}\/wait/);
  assert.match(sidePanelSource, /commands\/\$\{data\.id\}\/wait/);
});

test('messages detected during command handling trigger another processing pass', () => {
  assert.match(source, /let rerunRequested = false/);
  assert.match(source, /if \(processing\) \{\s*rerunRequested = true;/);
  assert.match(source, /if \(rerunRequested\) \{[\s\S]*setTimeout\(processNewMessages, 100\)/);
});

test('background service worker schedules heartbeats for registered agent tabs', () => {
  assert.match(backgroundSource, /chrome\.alarms\.create/);
  assert.match(backgroundSource, /AGENT_REGISTER/);
  assert.match(backgroundSource, /AGENT_HEARTBEAT/);
  assert.match(source, /AGENT_HEARTBEAT/);
  assert.match(backgroundSource, /executionTabIds/);
  assert.match(backgroundSource, /SET_EXECUTION_ENABLED/);
  assert.match(backgroundSource, /chrome\.storage\.session/);
  assert.match(source, /executionEnabled = false/);
  assert.match(source, /EXECUTION_STATE/);
});

test('extension loads the canonical Browse Code style prompt and protocol before content handling', () => {
  const scripts = manifest.content_scripts.flatMap((entry) => entry.js || []);
  assert.ok(scripts.indexOf('shared/ultra-prompt.js') >= 0);
  assert.ok(scripts.indexOf('shared/ultra-protocol.js') >= 0);
  assert.ok(scripts.indexOf('content.js') > scripts.indexOf('shared/ultra-prompt.js'));
  assert.ok(scripts.indexOf('content.js') > scripts.indexOf('shared/ultra-protocol.js'));
  assert.match(source, /UltraPrompt/);
  assert.match(source, /UltraProtocol/);
  assert.match(sidePanelSource, /buildStepPrompt/);
});

test('content waits for a finished response and corrects multiple actions instead of dropping one', () => {
  assert.match(source, /isAssistantGenerating/);
  assert.match(source, /one_action_per_turn/);
  assert.match(source, /exactly one.*action|one custom.*action/i);
});
