import { parseAction } from './action-interpreter.js';

function weakestRelation(nation, world) {
  let best = null;
  let value = Infinity;
  for (const [id, other] of Object.entries(world.nations)) {
    if (id === nation.id) continue;
    const relation = nation.relations?.[id] ?? 0;
    if (relation < value) {
      value = relation;
      best = other;
    }
  }
  return best;
}

function friendliestRelation(nation, world) {
  let best = null;
  let value = -Infinity;
  for (const [id, other] of Object.entries(world.nations)) {
    if (id === nation.id) continue;
    const relation = nation.relations?.[id] ?? 0;
    if (relation > value) {
      value = relation;
      best = other;
    }
  }
  return best;
}

export function chooseAIAction(ai, world, rng = Math.random) {
  const nation = world.nations[ai.nationId];
  if (!nation) {
    return {
      action: { id: `ai-invalid-${ai.id}`, kind: 'custom', actorNationId: ai.nationId, targetNationId: null, text: 'Hold position.', secrecy: 0, intensity: 'low', source: 'ai_player', tags: [] },
      rationale: 'No valid controlled nation is available, so the AI preserves the status quo.',
      status: 'WAITING',
    };
  }

  const personality = ai.personality ?? 'Balanced';
  const hostile = weakestRelation(nation, world);
  const friendly = friendliestRelation(nation, world);
  let text;
  let rationale;

  if (/Diplomat|Idealist/i.test(personality)) {
    const target = hostile ?? friendly;
    text = `Open discreet talks with ${target?.name ?? 'a neighboring power'} to reduce escalation and explore a limited agreement.`;
    rationale = `Tension is ${world.tension}/100. ${personality} behavior prioritizes de-escalation, credibility, and information gathering before coercive moves.`;
  } else if (/Economist|Scientist/i.test(personality)) {
    if (nation.economy < 70 || rng() < 0.65) {
      text = 'Launch an infrastructure and industrial productivity program while protecting food supply.';
      rationale = `The AI sees economic resilience as the constraint on future strategic freedom; current economy is ${nation.economy}/100.`;
    } else {
      text = 'Expand research and education funding to improve long-run technological capacity.';
      rationale = `The economy can absorb a modest near-term cost, so the AI converts capacity into a technology advantage.`;
    }
  } else if (/Aggressive|Expansionist/i.test(personality)) {
    const target = hostile;
    text = world.tension > 70
      ? `Begin partial military mobilization and increase pressure against ${target?.name ?? 'the primary rival'}.`
      : `Increase military readiness while testing the resolve of ${target?.name ?? 'the primary rival'}.`;
    rationale = `The AI accepts escalation risk because its configured posture values deterrence and initiative; global tension is ${world.tension}/100.`;
  } else if (/Isolationist/i.test(personality)) {
    text = 'Shift budget toward domestic stability, food security, and defensive readiness.';
    rationale = 'The AI avoids external commitments and invests in resilience against shocks it cannot control.';
  } else {
    if (world.tension > 78 && (ai.riskTolerance ?? 50) < 60) {
      const target = hostile;
      text = `Propose formal talks with ${target?.name ?? 'the main rival'} while keeping forces at current readiness.`;
      rationale = 'High tension makes preserving optionality more valuable than adding another escalatory commitment.';
    } else if (nation.economy < 58) {
      text = 'Invest in trade capacity and critical infrastructure to strengthen the economy.';
      rationale = 'The economy is the binding constraint, so the AI chooses a capacity-building action rather than force projection.';
    } else {
      text = 'Increase defensive readiness and consult allies about the current crisis.';
      rationale = 'A balanced posture hedges against military risk without immediately committing to offensive escalation.';
    }
  }

  const [action] = parseAction(text, ai.nationId);
  return {
    action: { ...action, source: 'ai_player' },
    rationale,
    status: /talk|consult|agreement|allies/i.test(text) ? 'NEGOTIATING' : /military|mobilization|readiness/i.test(text) ? 'PLANNING' : 'ANALYZING',
  };
}
