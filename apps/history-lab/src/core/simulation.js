function cloneWorld(world) {
  return structuredClone(world);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function yearFrom(world) {
  return Number(String(world.date).slice(0, 4));
}

function actorName(world, id) {
  return world.nations[id]?.name ?? (id === 'human' ? 'Human' : id);
}

function targetName(world, id) {
  return id ? (world.nations[id]?.name ?? id) : 'the world';
}

function effectLine(key, value) {
  const sign = value > 0 ? '+' : '';
  return `${key} ${sign}${value}`;
}

export function validateAction(action, world) {
  if (!action || !action.kind) return { ok: false, reason: 'Action is missing a structured type.' };
  if (action.kind === 'research' && action.tags?.includes('satellite') && yearFrom(world) < 1957) {
    return { ok: false, reason: 'Required satellite technology is not available in this era. Fund rocketry or astronomical research instead.' };
  }
  if (action.source !== 'god_intervention' && action.actorNationId !== 'human' && !world.nations[action.actorNationId]) {
    return { ok: false, reason: 'The acting nation does not exist in the current preset.' };
  }
  if (action.targetNationId && !world.nations[action.targetNationId]) {
    return { ok: false, reason: 'The target nation is outside the current preset.' };
  }
  return { ok: true };
}

export function applyAction(world, action, rng = Math.random) {
  const validation = validateAction(action, world);
  if (!validation.ok) {
    return {
      world,
      event: {
        id: `rejected-${action.id}`,
        date: world.date,
        title: 'Action rejected',
        summary: validation.reason,
        source: 'simulation',
        severity: 'low',
        actors: [action.actorNationId],
        regions: [],
        causes: ['Preset rules', 'Technology and authority validation'],
        effects: [],
        why: [{ label: 'Rule validation', weight: 100 }],
      },
      validation,
    };
  }

  const next = cloneWorld(world);
  const actor = next.nations[action.actorNationId];
  const target = action.targetNationId ? next.nations[action.targetNationId] : null;
  const roll = rng();
  const swing = Math.round((roll - 0.5) * 8);
  const effects = [];
  let title = 'Strategic action resolved';
  let summary = `${actorName(next, action.actorNationId)} carried out a strategic plan.`;
  let severity = 'medium';
  let causes = ['Player or AI intent', 'Current national capacity', 'Uncertainty'];
  let why = [
    { label: 'National capacity', weight: 42 },
    { label: 'Diplomatic environment', weight: 28 },
    { label: 'Operational uncertainty', weight: 30 },
  ];

  if (action.kind === 'diplomacy') {
    title = action.secrecy > 0.6 ? 'Back-channel diplomacy opens' : 'Diplomatic initiative launched';
    summary = `${actorName(next, action.actorNationId)} opened ${action.secrecy > 0.6 ? 'a discreet channel' : 'formal talks'} with ${targetName(next, action.targetNationId)}.`;
    if (actor) {
      actor.influence = clamp(actor.influence + 2 + Math.max(0, swing));
      actor.stability = clamp(actor.stability + (roll > 0.35 ? 1 : -1));
    }
    if (actor && target) {
      actor.relations[target.id] = clamp((actor.relations[target.id] ?? 0) + 7 + swing, -100, 100);
      target.relations[actor.id] = clamp((target.relations[actor.id] ?? 0) + 5 + swing, -100, 100);
      effects.push(effectLine('Relations', 7 + swing));
    }
    next.tension = clamp(next.tension - 4 - Math.max(0, swing));
    effects.push(effectLine('Global tension', -4 - Math.max(0, swing)));
  } else if (action.kind === 'military') {
    title = /blockade|naval/.test(action.text.toLowerCase()) ? 'Military pressure intensifies' : 'Forces begin new operation';
    summary = `${actorName(next, action.actorNationId)} committed military capacity toward ${targetName(next, action.targetNationId)}.`;
    if (actor) {
      actor.military = clamp(actor.military + (action.intensity === 'high' ? 2 : 1));
      actor.economy = clamp(actor.economy - (action.intensity === 'high' ? 4 : 2));
      actor.stability = clamp(actor.stability + swing / 2);
      effects.push(effectLine('Economy', action.intensity === 'high' ? -4 : -2));
    }
    next.tension = clamp(next.tension + 8 + Math.max(0, swing));
    effects.push(effectLine('Global tension', 8 + Math.max(0, swing)));
    severity = next.tension > 85 ? 'major' : 'high';
    why = [
      { label: 'Force readiness', weight: 36 },
      { label: 'Logistics and cost', weight: 34 },
      { label: 'Escalation risk', weight: 30 },
    ];
  } else if (action.kind === 'economy') {
    title = 'Economic program begins';
    summary = `${actorName(next, action.actorNationId)} redirected state capacity into economic and infrastructure measures.`;
    if (actor) {
      actor.economy = clamp(actor.economy + 4 + swing);
      actor.stability = clamp(actor.stability + Math.round((4 + swing) / 3));
      actor.food = clamp(actor.food + (/food|agric/.test(action.text.toLowerCase()) ? 5 : 1));
      effects.push(effectLine('Economy', 4 + swing));
    }
    next.globalEconomy = clamp(next.globalEconomy + 1);
    why = [
      { label: 'Investment capacity', weight: 45 },
      { label: 'Infrastructure constraints', weight: 33 },
      { label: 'Public response', weight: 22 },
    ];
  } else if (action.kind === 'research') {
    title = 'Research initiative funded';
    summary = `${actorName(next, action.actorNationId)} expanded scientific and technological investment.`;
    if (actor) {
      actor.technology = clamp(actor.technology + 3 + Math.max(0, swing));
      actor.economy = clamp(actor.economy - 1);
      effects.push(effectLine('Technology', 3 + Math.max(0, swing)));
    }
  } else if (action.kind === 'politics') {
    title = 'Domestic political campaign starts';
    summary = `${actorName(next, action.actorNationId)} attempted to shift domestic legitimacy and state capacity.`;
    if (actor) {
      actor.stability = clamp(actor.stability + 3 + swing);
      effects.push(effectLine('Stability', 3 + swing));
    }
  } else if (action.kind === 'world_intervention') {
    title = 'Direct God intervention';
    summary = action.text.replace(/^\s*god\s*:\s*/i, '');
    severity = 'god';
    causes = ['Direct user intervention'];
    why = [{ label: 'God intervention', weight: 100 }];
    const lower = action.text.toLowerCase();
    const cuba = next.nations.cuba;
    if (/food|grain|resource/.test(lower) && cuba) {
      cuba.food = clamp(cuba.food + 20);
      cuba.stability = clamp(cuba.stability + 5);
      effects.push('Cuba food +20', 'Cuba stability +5');
    }
    if (/drought/.test(lower)) {
      next.climateStress = clamp(next.climateStress + 20);
      effects.push('Climate stress +20');
    }
    if (/peace/.test(lower)) {
      next.tension = clamp(next.tension - 20);
      effects.push('Global tension -20');
    }
  } else {
    title = 'Open-ended policy attempt';
    summary = `${actorName(next, action.actorNationId)} attempted: “${action.text}”`;
    if (actor) actor.stability = clamp(actor.stability + swing);
    effects.push(effectLine('Stability', swing));
  }

  const event = {
    id: `event-${action.id}-${next.day}`,
    date: next.date,
    title,
    summary,
    source: action.source === 'god_intervention' ? 'god_intervention' : (action.source ?? 'player'),
    severity,
    actors: [action.actorNationId, action.targetNationId].filter(Boolean),
    regions: [],
    causes,
    effects,
    why,
  };
  next.events.unshift(event);
  next.history.push({ action, event });
  return { world: next, event, validation };
}

export function advanceDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function simulateBackground(world, days, rng = Math.random) {
  const next = cloneWorld(world);
  next.day += days;
  next.date = advanceDate(next.date, days);
  const populationPressure = Math.round((rng() - 0.5) * 4);
  const marketShock = Math.round((rng() - 0.5) * 5);
  for (const nation of Object.values(next.nations)) {
    nation.population = Math.max(1, Number((nation.population * (1 + days * 0.00002)).toFixed(2)));
    nation.economy = clamp(nation.economy + Math.round(marketShock / 2));
    nation.stability = clamp(nation.stability + Math.round(populationPressure / 2));
    nation.food = clamp(nation.food + Math.round((rng() - 0.48) * 3));
  }
  next.globalEconomy = clamp(next.globalEconomy + marketShock);
  next.climateStress = clamp(next.climateStress + (rng() > 0.75 ? 1 : 0));
  next.tension = clamp(next.tension + Math.round((rng() - 0.52) * 4));
  return next;
}
