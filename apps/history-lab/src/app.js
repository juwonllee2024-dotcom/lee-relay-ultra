import { PRESETS, createInitialWorld, getPreset } from './core/presets.js';
import { parseAction } from './core/action-interpreter.js';
import { applyAction, simulateBackground } from './core/simulation.js';
import { createRng } from './core/rng.js';
import { runTurn } from './core/turn.js';
import { renderPresetLibrary, renderSetupScreen, renderGameShell } from './ui/templates.js';

const STORAGE_KEY = 'history-lab-mvp-session-v1';
const app = document.querySelector('#app');

const state = {
  screen: 'library',
  filter: 'All',
  selectedPresetId: PRESETS[0].id,
  world: null,
  humanNationId: 'france',
  selectedNationId: 'france',
  activeTab: 'overview',
  layer: 'political',
  godMode: false,
  pendingActions: [],
  actionDraft: '',
  aiPlayers: [],
  selectedEventId: null,
  toast: null,
};

function nationName(id) {
  return state.world?.nations[id]?.name ?? id?.replaceAll('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) ?? '';
}

function saveSession() {
  if (!state.world) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    world: state.world,
    humanNationId: state.humanNationId,
    selectedNationId: state.selectedNationId,
    activeTab: state.activeTab,
    layer: state.layer,
    aiPlayers: state.aiPlayers,
  }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.world?.presetId) return false;
    Object.assign(state, saved, { screen: 'game', godMode: false, pendingActions: [], actionDraft: '' });
    return true;
  } catch {
    return false;
  }
}

function render() {
  if (state.screen === 'library') app.innerHTML = renderPresetLibrary(PRESETS, state.filter);
  if (state.screen === 'setup') app.innerHTML = renderSetupScreen(getPreset(state.selectedPresetId));
  if (state.screen === 'game') {
    app.innerHTML = renderGameShell(state.world, state);
    saveSession();
  }
  if (state.toast) renderToast(state.toast);
}

function showToast(message, tone = 'default') {
  state.toast = { message, tone };
  renderToast(state.toast);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    state.toast = null;
    document.querySelector('.toast')?.remove();
  }, 3200);
}

function renderToast({ message, tone }) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  document.body.appendChild(el);
}

function showModal(content) {
  document.querySelector('.modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal-card">${content}</div>`;
  document.body.appendChild(backdrop);
}

function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
}

function showPresetDetails(id) {
  const preset = getPreset(id);
  showModal(`<button class="modal-close" data-modal-close>×</button><span class="eyebrow">PRESET DETAIL</span><h2>${preset.title}</h2><div class="modal-date">${preset.subtitle}</div><p>${preset.summary}</p><div class="detail-grid"><div><small>COMPLEXITY</small><b>${preset.difficulty}</b></div><div><small>RECOMMENDED</small><b>${preset.grade}</b></div><div><small>PLAYABLE ACTORS</small><b>${preset.nations.length}</b></div><div><small>WORLD FIDELITY</small><b>${preset.category === 'Historical' ? '90%' : 'Adaptive'}</b></div></div><div class="modal-section"><small>AI FIT</small><p>${preset.aiReason}</p></div><button class="primary-action" data-modal-play="${preset.id}">PLAY SIMULATION</button>`);
}

function showAIChoose() {
  const scored = PRESETS.map((preset, index) => ({ preset, score: (preset.category === 'Education' ? 9 : 3) + preset.nations.length + (index % 3) }));
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0].preset;
  showModal(`<button class="modal-close" data-modal-close>×</button><span class="eyebrow">AI PRESET SELECTION</span><h2>${chosen.title}</h2><div class="modal-date">${chosen.subtitle}</div><div class="ai-choice-quote">“${chosen.aiReason}”</div><div class="modal-actions"><button class="ghost-btn" data-action="reroll-ai">REROLL</button><button class="primary-action" data-ai-accept="${chosen.id}">ACCEPT</button></div>`);
}

function startWorldFromSetup() {
  const preset = getPreset(state.selectedPresetId);
  const human = document.querySelector('#human-nation')?.value ?? preset.nations[0];
  const aiPlayers = [1, 2].map((n) => {
    const nationId = document.querySelector(`#ai-${n}-nation`)?.value;
    if (!nationId) return null;
    return {
      id: `ai-${n}`,
      nationId,
      nationName: nationId.replaceAll('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
      personality: document.querySelector(`#ai-${n}-personality`)?.value ?? 'Balanced',
      knowledgeMode: document.querySelector(`#ai-${n}-knowledge`)?.value ?? 'Period Accurate',
      riskTolerance: Number(document.querySelector(`#ai-${n}-risk`)?.value ?? 50),
      status: 'READY',
      rationale: 'Waiting for the first strategic observation cycle.',
      lastAction: 'No action committed yet.',
    };
  }).filter(Boolean);

  state.world = createInitialWorld(preset.id);
  state.humanNationId = human;
  state.selectedNationId = human;
  state.aiPlayers = aiPlayers.map((ai) => ({ ...ai, nationName: state.world.nations[ai.nationId]?.name ?? ai.nationName }));
  state.activeTab = 'overview';
  state.layer = 'political';
  state.pendingActions = [];
  state.actionDraft = '';
  state.screen = 'game';
  state.godMode = false;
  render();
  showToast('World initialized. Simulation is paused for planning.', 'success');
}

function interpretAction() {
  const input = document.querySelector('#action-input');
  state.actionDraft = input?.value.trim() ?? state.actionDraft;
  if (!state.actionDraft) return showToast('Write a plan first.', 'warning');
  state.pendingActions = parseAction(state.actionDraft, state.humanNationId);
  state.activeTab = 'actions';
  render();
}

function commitPendingActions(days = 7) {
  if (!state.pendingActions.length) return showToast('Interpret at least one action before committing.', 'warning');
  const result = runTurn(state.world, state.pendingActions, state.aiPlayers, days, state.world.seed);
  state.world = result.world;
  state.selectedEventId = result.world.events[0]?.id ?? null;
  state.aiPlayers = state.aiPlayers.map((ai) => {
    const aiResult = result.aiResults.find((item) => item.action.actorNationId === ai.nationId);
    return aiResult ? { ...ai, status: aiResult.status, rationale: aiResult.rationale, lastAction: aiResult.action.text } : ai;
  });
  const hadMajor = result.world.events.some((event) => event.severity === 'major');
  state.pendingActions = [];
  state.actionDraft = '';
  state.activeTab = hadMajor ? 'events' : 'overview';
  render();
  showToast(`${days} days simulated. Human and AI actions resolved through the same engine.`, 'success');
  if (hadMajor) setTimeout(() => showMajorEvent(result.world.events.find((event) => event.severity === 'major')), 120);
}

function advanceWorld(days) {
  const result = runTurn(state.world, [], state.aiPlayers, days, state.world.seed);
  state.world = result.world;
  state.aiPlayers = state.aiPlayers.map((ai) => {
    const aiResult = result.aiResults.find((item) => item.action.actorNationId === ai.nationId);
    return aiResult ? { ...ai, status: aiResult.status, rationale: aiResult.rationale, lastAction: aiResult.action.text } : ai;
  });
  state.selectedEventId = state.world.events[0]?.id ?? state.selectedEventId;
  state.activeTab = 'events';
  render();
  showToast(`Advanced ${days} days. AI players acted independently.`, 'success');
}

function showAdvanceModal() {
  showModal(`<button class="modal-close" data-modal-close>×</button><span class="eyebrow">ADVANCE TIME</span><h2>How far should history move?</h2><div class="advance-grid"><button data-advance-days="1">1 DAY</button><button data-advance-days="7">1 WEEK</button><button data-advance-days="30" class="selected">1 MONTH</button><button data-advance-days="90">3 MONTHS</button><button data-advance-days="365">1 YEAR</button></div><p class="modal-note">AI players will observe their filtered state, choose actions, and pass through normal validation before the background simulation advances.</p>`);
}

function applyGodPower(power) {
  const text = {
    food: 'GOD: add emergency food resources to Cuba.',
    resources: 'GOD: add emergency strategic resources to Cuba.',
    drought: 'GOD: trigger a severe drought.',
    peace: 'GOD: force peace and reduce global tension.',
  }[power];
  if (!text) return;
  const [action] = parseAction(text, 'human');
  const result = applyAction(state.world, action, createRng(state.world.seed + state.world.day));
  state.world = simulateBackground(result.world, 1, createRng(state.world.seed + 99));
  state.selectedEventId = result.event.id;
  state.activeTab = 'events';
  render();
  showToast('Direct intervention recorded separately from organic simulation.', 'warning');
}

function showMajorEvent(event) {
  if (!event) return;
  showModal(`<span class="major-kicker">MAJOR EVENT</span><h1>${event.title}</h1><div class="modal-date">${event.date}</div><p>${event.summary}</p><div class="modal-actions"><button class="ghost-btn" data-modal-close>VIEW MAP</button><button class="primary-action" data-event-why="${event.id}">WHY THIS HAPPENED</button></div>`);
}

function showHistoricalComparison() {
  const preset = getPreset(state.world.presetId);
  const event = state.world.events.find((item) => item.id === state.selectedEventId) ?? state.world.events[0];
  showModal(`<button class="modal-close" data-modal-close>×</button><span class="eyebrow">COUNTERFACTUAL COMPARISON</span><h2>Your timeline vs. reference history</h2><div class="timeline-compare"><div><small>YOUR TIMELINE</small><b>${event?.title ?? 'No divergence yet'}</b><p>${event?.summary ?? 'Advance the simulation to create a comparison point.'}</p></div><div><small>REFERENCE FRAME</small><b>${preset.title}</b><p>${referenceHistory(preset.id)}</p></div></div><div class="divergence-box"><span>POINT OF DIVERGENCE</span><b>${event?.date ?? preset.startDate}</b><p>The MVP marks the first simulated event as the current comparison anchor. Production education mode would attach sourced historical records per preset.</p></div>`);
}

function referenceHistory(id) {
  const refs = {
    'cuban-missile-crisis': 'Historically, the crisis intensified through reconnaissance, quarantine, back-channel negotiations, and a settlement that removed Soviet missiles from Cuba.',
    'wwii-1939': 'Historically, Germany invaded Poland on September 1, 1939; Britain and France declared war shortly afterward, beginning the European phase of World War II.',
    'prevent-wwi': 'Historically, the July Crisis escalated through ultimatums, mobilizations, declarations of war, and alliance commitments into a general European war.',
    'rome-395': 'Historically, the Western Roman Empire fragmented over the following decades and the traditional imperial line ended in AD 476.',
    'mars-2140': 'This is a fictional preset, so comparison is against the preset’s baseline assumptions rather than real history.',
  };
  return refs[id] ?? 'Reference history is supplied by the preset education layer.';
}

app.addEventListener('input', (event) => {
  if (event.target?.id === 'action-input') state.actionDraft = event.target.value;
});

app.addEventListener('click', (event) => {
  const target = event.target.closest('button, [data-nation], [data-preset]');
  if (!target) return;

  if (target.dataset.filter) {
    state.filter = target.dataset.filter;
    return render();
  }
  if (target.dataset.play) {
    state.selectedPresetId = target.dataset.play;
    state.screen = 'setup';
    return render();
  }
  if (target.dataset.details) return showPresetDetails(target.dataset.details);
  if (target.dataset.nation) {
    state.selectedNationId = target.dataset.nation;
    state.activeTab = 'overview';
    return render();
  }
  if (target.dataset.layer) {
    state.layer = target.dataset.layer;
    return render();
  }
  if (target.dataset.tab) {
    state.activeTab = target.dataset.tab;
    return render();
  }
  if (target.dataset.tabJump) {
    state.activeTab = target.dataset.tabJump;
    return render();
  }
  if (target.dataset.event) {
    state.selectedEventId = target.dataset.event;
    state.activeTab = 'learn';
    return render();
  }
  if (target.dataset.god) return applyGodPower(target.dataset.god);

  const action = target.dataset.action;
  if (action === 'resume') return loadSession() ? render() : showToast('No saved simulation yet.', 'warning');
  if (action === 'ai-choose') return showAIChoose();
  if (action === 'back-library') { state.screen = 'library'; state.godMode = false; return render(); }
  if (action === 'start-world') return startWorldFromSetup();
  if (action === 'interpret') return interpretAction();
  if (action === 'commit') return commitPendingActions(7);
  if (action === 'advance') return showAdvanceModal();
  if (action === 'toggle-god') { state.godMode = !state.godMode; return render(); }
  if (action === 'compare-history') return showHistoricalComparison();
  if (action === 'example-diplomacy') { state.actionDraft = 'Open secret talks with the Soviet Union to reduce escalation while publicly consulting allies.'; state.activeTab = 'actions'; return render(); }
  if (action === 'example-context') return showToast('Historical context stays separate from strategic advice so learning does not become optimization.', 'default');
  if (action === 'create-preset') return showToast('Preset Creator is the next vertical slice: world → history → actors → rules → map → education.', 'default');
});

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-modal-close], [data-modal-play], [data-ai-accept], [data-advance-days], [data-event-why]');
  if (!target) return;
  if (target.dataset.modalClose !== undefined) return closeModal();
  if (target.dataset.modalPlay) {
    state.selectedPresetId = target.dataset.modalPlay;
    state.screen = 'setup';
    closeModal();
    return render();
  }
  if (target.dataset.aiAccept) {
    state.selectedPresetId = target.dataset.aiAccept;
    state.screen = 'setup';
    closeModal();
    return render();
  }
  if (target.dataset.advanceDays) {
    const days = Number(target.dataset.advanceDays);
    closeModal();
    return advanceWorld(days);
  }
  if (target.dataset.eventWhy) {
    state.selectedEventId = target.dataset.eventWhy;
    state.activeTab = 'learn';
    closeModal();
    return render();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

render();
