import { createRng } from './rng.js';
import { applyAction, simulateBackground } from './simulation.js';
import { chooseAIAction } from './ai-agent.js';

export function runTurn(world, humanActions, aiPlayers, days = 7, seed = world.seed ?? 1) {
  const rng = createRng(seed + world.day + world.history.length * 31);
  let current = structuredClone(world);
  const resolved = [];
  const aiResults = [];

  for (const action of humanActions) {
    const result = applyAction(current, { ...action, source: action.source ?? 'player' }, rng);
    current = result.world;
    resolved.push(result);
  }

  for (const ai of aiPlayers) {
    const proposal = chooseAIAction(ai, current, rng);
    const result = applyAction(current, proposal.action, rng);
    current = result.world;
    aiResults.push({ ...proposal, event: result.event });
    resolved.push(result);
  }

  current = simulateBackground(current, days, rng);
  current.seed = (seed + 1) >>> 0;
  return { world: current, resolved, aiResults };
}
