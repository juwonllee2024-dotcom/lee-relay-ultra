const esc = (value = '') => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));

export function renderPresetLibrary(presets, filter = 'All') {
  const categories = ['All', 'Education', 'Historical', 'Alternate', 'Sci-Fi'];
  const visible = filter === 'All' ? presets : presets.filter((preset) => preset.category === filter);
  return `
    <div class="library-screen">
      <header class="library-header">
        <div class="brand"><span class="brand-mark">HL</span><div><b>HISTORY LAB</b><small>AI CIVILIZATION SANDBOX</small></div></div>
        <div class="header-actions"><button class="ghost-btn" data-action="resume">Resume</button><button class="icon-btn" aria-label="Settings">⚙</button></div>
      </header>
      <aside class="library-sidebar">
        <div class="sidebar-label">DISCOVER</div>
        ${categories.map((category) => `<button class="side-item ${filter === category ? 'active' : ''}" data-filter="${category}">${category}</button>`).join('')}
        <div class="sidebar-label spaced">HISTORY</div>
        ${['Modern Day', 'Cold War', 'WWII', 'Interwar', 'WWI', 'Age of Empire', 'Medieval', 'Ancient'].map((item) => `<button class="side-item subtle">${item}</button>`).join('')}
        <div class="sidebar-label spaced">CREATE</div>
        <button class="create-btn" data-action="create-preset">＋ CREATE PRESET</button>
      </aside>
      <main class="library-main">
        <div class="library-title-row">
          <div><span class="eyebrow">SIMULATION LIBRARY</span><h1>PRESET LIBRARY</h1><p>Choose a world, take control of an actor, then let history react.</p></div>
          <button class="ai-choose-btn" data-action="ai-choose"><span>✦</span> LET AI CHOOSE</button>
        </div>
        <div class="preset-grid">
          ${visible.map((preset, i) => renderPresetCard(preset, i)).join('')}
        </div>
      </main>
    </div>`;
}

function renderPresetCard(preset, index) {
  const palettes = ['map-blue', 'map-amber', 'map-rose', 'map-violet', 'map-red'];
  return `<article class="preset-card" data-preset="${esc(preset.id)}">
    <div class="preset-art ${palettes[index % palettes.length]}">
      <div class="mini-globe" aria-hidden="true"><span></span><i></i><b></b></div>
      <span class="preset-category">${esc(preset.category)}</span>
      <div class="card-hover"><button data-play="${esc(preset.id)}">PLAY</button><button data-details="${esc(preset.id)}">DETAILS</button></div>
    </div>
    <div class="preset-body">
      <h3>${esc(preset.title)}</h3><div class="preset-date">${esc(preset.subtitle)}</div>
      <p>${esc(preset.summary)}</p>
      <div class="preset-meta"><span>◉ ${esc(preset.difficulty)}</span><span>🎓 ${esc(preset.grade)}</span></div>
    </div>
  </article>`;
}


export function renderSetupScreen(preset) {
  const options = preset.nations.map((id, index) => `<option value="${esc(id)}" ${index === 0 ? 'selected' : ''}>${esc(id.replaceAll('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase()))}</option>`).join('');
  const knowledge = ['Period Accurate', 'General Historical', 'Full Future Knowledge', 'Blank Slate'];
  return `
    <div class="setup-screen">
      <header class="setup-header"><button class="ghost-btn" data-action="back-library">← PRESETS</button><div><span class="eyebrow">WORLD SETUP</span><h1>${esc(preset.title)}</h1><p>${esc(preset.subtitle)}</p></div><div class="setup-badge">${esc(preset.category)}</div></header>
      <main class="setup-main">
        <section class="setup-preview">
          <div class="setup-world-visual"><div class="setup-orbit orbit-a"></div><div class="setup-orbit orbit-b"></div><div class="setup-globe"><span></span></div></div>
          <span class="eyebrow">SIMULATION BRIEF</span><h2>${esc(preset.summary)}</h2>
          <div class="rule-summary"><span>Fog of War <b>ON</b></span><span>AI Freedom <b>HIGH</b></span><span>Historical Bias <b>80%</b></span><span>Disasters <b>NORMAL</b></span></div>
        </section>
        <section class="setup-config">
          <div class="player-block human-block"><div class="player-label">HUMAN PLAYER</div><label>Controls<select id="human-nation">${options}</select></label><label>Role<select><option>Independent Ruler</option><option>Observer / God</option><option>Government Lead</option></select></label></div>
          ${[1,2].map((n, idx) => `<div class="player-block ai-block"><div class="player-label">AI PLAYER ${n}</div><label>Controls<select id="ai-${n}-nation"><option value="">Disabled</option>${preset.nations.map((id, i) => `<option value="${esc(id)}" ${(idx === 0 && i === 1) || (idx === 1 && i === 2) ? 'selected' : ''}>${esc(id.replaceAll('-', ' ').replace(/\b\w/g, (m) => m.toUpperCase()))}</option>`).join('')}</select></label><label>Strategic Personality<select id="ai-${n}-personality"><option>${idx === 0 ? 'Diplomat' : 'Aggressive Strategist'}</option><option>Balanced</option><option>Economist</option><option>Scientist</option><option>Isolationist</option></select></label><label>Historical Knowledge<select id="ai-${n}-knowledge">${knowledge.map((item) => `<option>${item}</option>`).join('')}</select></label><label>Risk Tolerance<input id="ai-${n}-risk" type="range" min="0" max="100" value="${idx === 0 ? 35 : 80}"></label></div>`).join('')}
          <button class="start-world-btn" data-action="start-world">START WORLD <span>→</span></button>
        </section>
      </main>
    </div>`;
}

export function renderGameShell(world, state) {
  const nation = world.nations[state.selectedNationId] ?? Object.values(world.nations)[0];
  const tabs = ['overview', 'events', 'actions', 'ai', 'diplomacy', 'learn'];
  return `
    <div class="game-shell">
      <header class="game-header">
        <button class="icon-btn" data-action="back-library" title="Preset library">☰</button>
        <div class="sim-identity"><span class="status-dot"></span><b>${esc(world.presetId.replaceAll('-', ' ').toUpperCase())}</b></div>
        <div class="time-cluster"><button class="tiny-btn">◀</button><strong>${esc(formatDate(world.date))}</strong><button class="tiny-btn">▶</button><button class="pause-btn">Ⅱ</button><button class="speed-btn">1×</button><button class="advance-btn" data-action="advance">ADVANCE</button></div>
        <div class="header-metrics"><span>TENSION <b>${world.tension}</b></span><span>ECON <b>${world.globalEconomy}</b></span><button class="lesson-chip">🎓 LESSON</button></div>
      </header>
      <section class="map-stage">
        <div class="map-title"><span class="eyebrow">WORLD MAP</span><strong>${esc(state.layer.toUpperCase())} LAYER</strong></div>
        ${renderWorldMap(world, state.layer, state.selectedNationId)}
        <div class="layer-stack">
          ${[['political','◫'],['population','▦'],['economy','$'],['military','⚔'],['stability','◇']].map(([layer, icon]) => `<button class="layer-btn ${state.layer === layer ? 'active' : ''}" data-layer="${layer}" title="${layer}">${icon}</button>`).join('')}
        </div>
        <div class="map-legend"><span><i class="legend-dot friendly"></i> cooperative</span><span><i class="legend-dot tense"></i> tense</span><span><i class="legend-dot selected"></i> selected</span></div>
      </section>
      <aside class="context-panel">
        <nav class="context-tabs">${tabs.map((tab) => `<button class="context-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('')}</nav>
        <div class="context-content">${renderContext(world, nation, state)}</div>
      </aside>
      ${state.godMode ? `<div class="god-palette"><div class="god-palette-head"><div><span class="eyebrow">DIRECT INTERVENTION</span><b>GOD MODE</b></div><button data-action="toggle-god">×</button></div><p>These actions bypass organic causality and are logged separately for education.</p><div class="god-grid"><button data-god="food">🌾<span>Emergency Food</span></button><button data-god="resources">⛏<span>Add Resources</span></button><button data-god="drought">☀<span>Drought</span></button><button data-god="peace">☮<span>Force Peace</span></button></div></div>` : ''}
      <footer class="game-toolbar">
        <div class="toolbar-section"><span class="toolbar-caption">WORLD TOOLS</span>${['MAP','PEOPLE','CIVILIZATION','ECONOMY','NATURE','DISASTER','HISTORY','AI'].map((label) => `<button class="tool-btn">${label}</button>`).join('')}</div>
        <button class="god-btn ${state.godMode ? 'active' : ''}" data-action="toggle-god">⚡ GOD MODE</button>
      </footer>
    </div>`;
}

function renderContext(world, nation, state) {
  if (state.activeTab === 'events') return renderEvents(world);
  if (state.activeTab === 'actions') return renderActions(state);
  if (state.activeTab === 'ai') return renderAI(state.aiPlayers ?? []);
  if (state.activeTab === 'diplomacy') return renderDiplomacy(world, nation);
  if (state.activeTab === 'learn') return renderLearn(world, state);
  return renderOverview(nation, world);
}

function renderOverview(nation, world) {
  if (!nation) return '<div class="empty-state">Select a nation on the map.</div>';
  const relationRows = Object.entries(nation.relations ?? {}).slice(0, 5).map(([id, score]) => `<div class="relation-row"><span>${esc(world.nations[id]?.name ?? id)}</span><b class="${score >= 0 ? 'positive' : 'negative'}">${score > 0 ? '+' : ''}${score}</b></div>`).join('');
  return `<div class="nation-card"><div class="nation-heading"><span class="nation-swatch" style="--swatch:${esc(nation.color)}"></span><div><span class="eyebrow">SELECTED NATION</span><h2>${esc(nation.name)}</h2></div></div>
    <div class="stat-grid">${[['Population',nation.population],['Economy',nation.economy],['Military',nation.military],['Technology',nation.technology]].map(([label,value]) => `<div class="stat-tile"><span>${label}</span><strong>${value}</strong><div class="meter"><i style="width:${Math.min(100, Number(value))}%"></i></div></div>`).join('')}</div>
    <div class="wide-stat"><div><span>STABILITY</span><b>${Math.round(nation.stability)}</b></div><div class="meter"><i style="width:${nation.stability}%"></i></div></div>
    <div class="section-title">RELATIONS</div>${relationRows || '<p class="muted">No direct relationship data.</p>'}
    <div class="panel-actions"><button data-tab-jump="actions">CREATE ACTION</button><button data-tab-jump="learn">WHY?</button></div></div>`;
}

function renderEvents(world) {
  if (!world.events.length) return `<div class="empty-state"><span class="empty-icon">◎</span><h3>No resolved events yet</h3><p>Commit an action or advance time to start the timeline.</p></div>`;
  return `<div class="panel-heading"><span class="eyebrow">CANONICAL TIMELINE</span><h2>WORLD EVENTS</h2></div><div class="event-list">${world.events.map((event) => `<button class="event-card ${event.source === 'god_intervention' ? 'god-event' : ''}" data-event="${esc(event.id)}"><span class="event-source">${event.source === 'god_intervention' ? '⚡ GOD INTERVENTION' : esc(event.source.replace('_',' ').toUpperCase())}</span><strong>${esc(event.title)}</strong><p>${esc(event.summary)}</p><small>${esc(formatDate(event.date))} · ${esc(event.severity)}</small></button>`).join('')}</div>`;
}

function renderActions(state) {
  const interpreted = state.pendingActions ?? [];
  return `<div class="panel-heading"><span class="eyebrow">YOUR ACTIONS</span><h2>Issue a plan</h2><p>Write naturally. The interpreter converts your intent into validated game commands before the world changes.</p></div>
    <textarea id="action-input" class="action-input" placeholder="Example: Open secret talks with the USSR to reduce tensions while publicly supporting the United States.">${esc(state.actionDraft ?? '')}</textarea>
    <div class="action-helper-row"><button class="mini-action" data-action="example-diplomacy">🎯 Make Specific</button><button class="mini-action" data-action="example-context">📚 Historical Context</button></div>
    <button class="primary-action" data-action="interpret">INTERPRET ACTION</button>
    ${interpreted.length ? `<div class="interpretation-box"><span class="eyebrow">INTERPRETED ACTION</span>${interpreted.map((action) => `<div class="parsed-row"><div><small>TYPE</small><b>${esc(action.kind.toUpperCase())}</b></div><div><small>TARGET</small><b>${esc(action.targetNationId ?? '—')}</b></div><div><small>SECRECY</small><b>${Math.round(action.secrecy * 100)}%</b></div></div>`).join('')}<button class="commit-action" data-action="commit">CONFIRM & COMMIT</button></div>` : ''}`;
}

function renderAI(aiPlayers) {
  if (!aiPlayers.length) return `<div class="empty-state"><span class="empty-icon">✦</span><h3>No AI players</h3><p>Add up to two AI actors from the setup screen.</p></div>`;
  return `<div class="panel-heading"><span class="eyebrow">AI PLAYERS</span><h2>Agent activity</h2><p>Public work status and concise rationales only — no private chain-of-thought.</p></div>${aiPlayers.map((ai, index) => `<article class="ai-card"><div class="ai-card-top"><span class="ai-index">AI #${index + 1}</span><span class="ai-status">● ${esc(ai.status ?? 'READY')}</span></div><h3>${esc(ai.nationName ?? ai.nationId)}</h3><p class="ai-personality">${esc(ai.personality)} · ${esc(ai.knowledgeMode)}</p><div class="section-title">PUBLIC RATIONALE</div><p>${esc(ai.rationale ?? 'Waiting for the next simulation step.')}</p><div class="section-title">LAST ACTION</div><p class="muted">${esc(ai.lastAction ?? 'No action committed yet.')}</p></article>`).join('')}`;
}

function renderDiplomacy(world, nation) {
  const peers = Object.values(world.nations).filter((other) => other.id !== nation?.id).slice(0, 6);
  return `<div class="panel-heading"><span class="eyebrow">DIPLOMACY</span><h2>Channels</h2><p>Open channels can become structured treaties instead of disappearing into chat text.</p></div><div class="channel-list">${peers.map((other) => `<button class="channel"><span class="nation-swatch" style="--swatch:${esc(other.color)}"></span><div><b>${esc(other.name)}</b><small>${nation ? (nation.relations?.[other.id] ?? 0) : 0} relation</small></div><span>›</span></button>`).join('')}</div>`;
}

function renderLearn(world, state) {
  const event = world.events.find((item) => item.id === state.selectedEventId) ?? world.events[0];
  if (!event) return `<div class="empty-state"><span class="empty-icon">?</span><h3>Why did this happen?</h3><p>Resolve an event first. History Lab will separate direct causes, systemic pressures, and interventions.</p></div>`;
  return `<div class="panel-heading"><span class="eyebrow">WHY DID THIS HAPPEN?</span><h2>${esc(event.title)}</h2><p>${esc(event.summary)}</p></div><div class="cause-chart">${event.why.map((cause) => `<div class="cause-row"><div><span>${esc(cause.label)}</span><b>${cause.weight}%</b></div><div class="cause-bar"><i style="width:${cause.weight}%"></i></div></div>`).join('')}</div><div class="section-title">CANONICAL EFFECTS</div><ul class="effect-list">${(event.effects.length ? event.effects : ['No quantified effect recorded.']).map((effect) => `<li>${esc(effect)}</li>`).join('')}</ul><button class="compare-btn" data-action="compare-history">COMPARE TO REAL HISTORY</button>`;
}

function valueForLayer(nation, layer) {
  if (layer === 'population') return Math.min(100, Math.log10(Math.max(1, nation.population)) * 40);
  if (layer === 'economy') return nation.economy;
  if (layer === 'military') return nation.military;
  if (layer === 'stability') return nation.stability;
  return 55;
}

const MAP_POSITIONS = {
  usa: [280, 300], cuba: [375, 405], france: [655, 315], uk: [625, 275], germany: [700, 305], poland: [742, 304], italy: [696, 360], ussr: [860, 265], russia: [860, 265], serbia: [730, 360], 'austria-hungary': [715, 335], 'western-rome': [668, 360], 'eastern-rome': [760, 372], visigoths: [630, 350], 'ares-union': [830, 430], 'nova-commonwealth': [930, 450], 'red-frontier': [760, 485],
};

function renderWorldMap(world, layer, selectedNationId) {
  const nodes = Object.values(world.nations).map((nation) => {
    const [x, y] = MAP_POSITIONS[nation.id] ?? [540 + (nation.id.length * 17) % 380, 320 + (nation.id.length * 31) % 180];
    const value = valueForLayer(nation, layer);
    const radius = layer === 'population' ? 10 + value / 9 : 17;
    return `<g class="nation-node ${selectedNationId === nation.id ? 'selected' : ''}" data-nation="${esc(nation.id)}" transform="translate(${x} ${y})"><circle r="${radius + 8}" class="node-halo"></circle><circle r="${radius}" class="node-core" style="--nation:${esc(nation.color)};--intensity:${Math.round(value)}%"></circle><text y="${radius + 24}">${esc(nation.name)}</text><title>${esc(nation.name)} · ${layer} ${Math.round(value)}</title></g>`;
  }).join('');
  return `<svg class="world-map" viewBox="0 0 1200 700" role="img" aria-label="WORLD MAP">
    <defs><radialGradient id="oceanGlow"><stop offset="0" stop-color="#173047"/><stop offset="1" stop-color="#08121e"/></radialGradient><filter id="softGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="1200" height="700" fill="url(#oceanGlow)"/>
    <g class="grid-lines">${[100,200,300,400,500,600].map((y) => `<path d="M0 ${y} H1200"/>`).join('')}${[150,300,450,600,750,900,1050].map((x) => `<path d="M${x} 0 V700"/>`).join('')}</g>
    <g class="continents">
      <path d="M122 120 C188 72 310 75 360 126 C389 159 357 184 325 197 C302 209 321 235 301 255 C275 280 248 267 229 292 C199 331 157 299 156 253 C155 224 125 219 108 187 C95 164 98 139 122 120Z"/>
      <path d="M305 325 C341 307 382 323 400 357 C417 391 395 424 408 461 C421 500 393 551 358 579 C334 598 312 578 322 546 C331 518 312 495 309 462 C305 420 276 380 305 325Z"/>
      <path d="M565 150 C626 107 711 123 746 169 C771 202 735 232 714 253 C748 267 794 258 818 285 C851 323 806 351 771 348 C733 345 718 377 682 369 C645 360 616 343 594 314 C572 286 542 260 533 220 C526 189 540 168 565 150Z"/>
      <path d="M748 165 C831 112 1018 111 1092 181 C1124 212 1091 245 1048 249 C1010 253 1003 282 955 282 C914 282 892 252 851 263 C812 274 771 256 751 224 C738 204 731 183 748 165Z"/>
      <path d="M884 329 C936 303 999 313 1021 349 C1044 386 1005 423 986 455 C969 485 929 492 895 470 C868 452 843 415 850 377 C854 353 866 339 884 329Z"/>
      <path d="M975 518 C1018 500 1070 513 1087 541 C1101 565 1073 590 1041 592 C1002 594 965 575 958 550 C953 535 961 524 975 518Z"/>
    </g>
    <g class="trade-routes"><path d="M280 300 Q520 190 655 315"/><path d="M655 315 Q760 225 860 265"/><path d="M375 405 Q620 480 860 265"/></g>
    <g class="nation-nodes">${nodes}</g>
    <g class="map-labels"><text x="170" y="160">NORTH AMERICA</text><text x="320" y="425">SOUTH AMERICA</text><text x="630" y="240">EUROPE</text><text x="900" y="200">ASIA</text><text x="890" y="405">AFRICA</text></g>
  </svg>`;
}

export function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date).toUpperCase();
}
