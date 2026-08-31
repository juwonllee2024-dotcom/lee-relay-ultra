const aliases = {
  poland: ['poland', 'polish'],
  france: ['france', 'french'],
  usa: ['usa', 'united states', 'america', 'american'],
  ussr: ['ussr', 'soviet union', 'soviet', 'moscow'],
  cuba: ['cuba', 'cuban'],
  uk: ['united kingdom', 'britain', 'british', 'uk'],
  germany: ['germany', 'german'],
  italy: ['italy', 'italian'],
  russia: ['russia', 'russian'],
  serbia: ['serbia', 'serbian'],
};

function targetFrom(text) {
  const lower = text.toLowerCase();
  for (const [id, names] of Object.entries(aliases)) {
    if (names.some((name) => lower.includes(name))) return id;
  }
  return null;
}

function baseAction(kind, text, actorNationId, extra = {}) {
  return {
    id: `${kind}-${Math.abs(hashText(`${actorNationId}:${text}:${kind}`))}`,
    kind,
    actorNationId,
    targetNationId: extra.targetNationId ?? targetFrom(text),
    text,
    secrecy: extra.secrecy ?? (/secret|discreet|covert|quiet/i.test(text) ? 0.8 : 0.1),
    intensity: extra.intensity ?? (/aggressive|immediate|massive|full/i.test(text) ? 'high' : 'medium'),
    source: /^\s*god\s*:/i.test(text) ? 'god_intervention' : (extra.source ?? 'player'),
    tags: extra.tags ?? [],
  };
}

function hashText(input) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

export function parseAction(text, actorNationId) {
  const lower = text.toLowerCase();
  if (/^\s*god\s*:/.test(lower)) {
    return [baseAction('world_intervention', text, actorNationId, { tags: ['direct-intervention'] })];
  }

  if (/satellite|orbital|spacecraft|rocket to orbit/.test(lower)) {
    return [baseAction('research', text, actorNationId, { tags: ['satellite'] })];
  }

  const actions = [];
  if (/guarantee|treaty|talk|negot|summit|alliance|peace|relations|diplom/.test(lower)) {
    actions.push(baseAction('diplomacy', text, actorNationId));
  }
  if (/mobiliz|attack|invad|troop|army|naval|blockade|military|defen/.test(lower)) {
    actions.push(baseAction('military', text, actorNationId));
  }
  if (/industrial|factory|budget|tax|trade|sanction|econom|rail|infrastructure/.test(lower)) {
    actions.push(baseAction('economy', text, actorNationId));
  }
  if (/research|develop|technology|science|education/.test(lower)) {
    actions.push(baseAction('research', text, actorNationId));
  }
  if (/reform|welfare|propaganda|election|law|politic|stability/.test(lower)) {
    actions.push(baseAction('politics', text, actorNationId));
  }
  if (actions.length === 0) actions.push(baseAction('custom', text, actorNationId));
  return actions;
}
