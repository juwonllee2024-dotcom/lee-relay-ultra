import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAction } from '../src/core/action-interpreter.js';
import { PRESETS, createInitialWorld } from '../src/core/presets.js';
import { applyAction, validateAction } from '../src/core/simulation.js';
import { createRng } from '../src/core/rng.js';

test('classifies a security guarantee and secret mobilization as two structured actions', () => {
  const actions = parseAction(
    'Offer Poland a military guarantee while discreetly beginning partial mobilization.',
    'france',
  );
  assert.deepEqual(actions.map((action) => action.kind), ['diplomacy', 'military']);
  assert.equal(actions[0].targetNationId, 'poland');
  assert.ok(actions[1].secrecy > 0.5);
});

test('rejects an era-impossible satellite launch in a 1939 preset', () => {
  const world = createInitialWorld('wwii-1939');
  const [action] = parseAction('Launch an orbital satellite immediately.', 'germany');
  const result = validateAction(action, world);
  assert.equal(result.ok, false);
  assert.match(result.reason.toLowerCase(), /technology/);
});

test('same seed, state, and action produce the same canonical event', () => {
  const worldA = createInitialWorld('cuban-missile-crisis');
  const worldB = createInitialWorld('cuban-missile-crisis');
  const [action] = parseAction('Open secret talks with the Soviet Union to reduce escalation.', 'france');
  const first = applyAction(worldA, action, createRng(42));
  const second = applyAction(worldB, action, createRng(42));
  assert.deepEqual(first.event, second.event);
  assert.equal(first.world.nations.france.stability, second.world.nations.france.stability);
});

test('direct interventions are tagged separately from organic events', () => {
  const world = createInitialWorld('cuban-missile-crisis');
  const [action] = parseAction('GOD: add emergency food resources to Cuba.', 'human');
  const result = applyAction(world, action, createRng(7));
  assert.equal(result.event.source, 'god_intervention');
});

import { chooseAIAction } from '../src/core/ai-agent.js';

test('diplomat AI proposes a diplomacy action through the same structured API', () => {
  const world = createInitialWorld('cuban-missile-crisis');
  const ai = { id: 'ai-1', nationId: 'usa', personality: 'Diplomat', riskTolerance: 35 };
  const proposal = chooseAIAction(ai, world, createRng(2));
  assert.equal(proposal.action.source, 'ai_player');
  assert.equal(proposal.action.kind, 'diplomacy');
  assert.ok(proposal.rationale.length > 10);
});

test('aggressive strategist reacts to high tension without mutating world state', () => {
  const world = createInitialWorld('cuban-missile-crisis');
  const before = structuredClone(world);
  const ai = { id: 'ai-2', nationId: 'ussr', personality: 'Aggressive Strategist', riskTolerance: 80 };
  const proposal = chooseAIAction(ai, world, createRng(9));
  assert.equal(proposal.action.source, 'ai_player');
  assert.deepEqual(world, before);
});

import { renderPresetLibrary, renderSetupScreen, renderGameShell } from '../src/ui/templates.js';

test('preset library foregrounds preset choice and AI selection', () => {
  const html = renderPresetLibrary(PRESETS, 'All');
  assert.match(html, /PRESET LIBRARY/);
  assert.match(html, /LET AI CHOOSE/);
  assert.match(html, /Cuban Missile Crisis/);
});

test('game shell keeps the world map as the primary surface and exposes contextual tabs', () => {
  const world = createInitialWorld('cuban-missile-crisis');
  const html = renderGameShell(world, { activeTab: 'overview', selectedNationId: 'france', layer: 'political', aiPlayers: [] });
  assert.match(html, /WORLD MAP/);
  assert.match(html, /OVERVIEW/);
  assert.match(html, /EVENTS/);
  assert.match(html, /ACTIONS/);
  assert.match(html, /LEARN/);
});

import { runTurn } from '../src/core/turn.js';

test('one turn resolves human and AI actions through the same simulation pipeline before time advances', () => {
  const world = createInitialWorld('cuban-missile-crisis');
  const [humanAction] = parseAction('Open secret talks with the Soviet Union to reduce escalation.', 'france');
  const aiPlayers = [
    { id: 'ai-1', nationId: 'usa', personality: 'Diplomat', knowledgeMode: 'Period Accurate', riskTolerance: 35 },
    { id: 'ai-2', nationId: 'ussr', personality: 'Aggressive Strategist', knowledgeMode: 'Period Accurate', riskTolerance: 80 },
  ];
  const result = runTurn(world, [humanAction], aiPlayers, 7, 44);
  assert.equal(result.aiResults.length, 2);
  assert.equal(result.world.history.length, 3);
  assert.equal(result.world.date, '1962-10-21');
  assert.equal(result.aiResults.every((item) => item.action.source === 'ai_player'), true);
});


test('setup screen supports human plus two AI players and knowledge modes', () => {
  const preset = PRESETS.find((item) => item.id === 'cuban-missile-crisis');
  const html = renderSetupScreen(preset);
  assert.match(html, /HUMAN PLAYER/);
  assert.match(html, /AI PLAYER 1/);
  assert.match(html, /AI PLAYER 2/);
  assert.match(html, /Period Accurate/);
  assert.match(html, /START WORLD/);
});
