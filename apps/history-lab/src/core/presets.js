const nation = (id, name, color, stats = {}) => ({
  id,
  name,
  color,
  population: stats.population ?? 50,
  economy: stats.economy ?? 60,
  military: stats.military ?? 60,
  stability: stats.stability ?? 65,
  technology: stats.technology ?? 60,
  food: stats.food ?? 65,
  influence: stats.influence ?? 60,
  relations: { ...(stats.relations ?? {}) },
});

export const PRESETS = [
  {
    id: 'cuban-missile-crisis',
    title: 'Cuban Missile Crisis',
    subtitle: 'October 1962',
    category: 'Education',
    startDate: '1962-10-14',
    summary: 'Navigate nuclear brinkmanship while alliances, intelligence, and public commitments collide.',
    grade: 'Grade 9–12',
    difficulty: 'Intermediate',
    aiReason: 'Diplomacy and uncertainty matter more than direct conquest, which makes the AI players visibly reason about risk.',
    nations: ['france', 'usa', 'ussr', 'cuba', 'uk'],
  },
  {
    id: 'wwii-1939',
    title: 'World War II',
    subtitle: 'September 1939',
    category: 'Historical',
    startDate: '1939-09-01',
    summary: 'A volatile opening month where guarantees, mobilization, logistics, and coalition choices rapidly compound.',
    grade: 'Grade 9–12',
    difficulty: 'Advanced',
    aiReason: 'The scenario rewards multi-domain planning and exposes the cost of actions through diplomacy, logistics, and industry.',
    nations: ['germany', 'poland', 'france', 'uk', 'ussr', 'italy'],
  },
  {
    id: 'rome-395',
    title: 'Can Rome Survive?',
    subtitle: 'AD 395',
    category: 'Alternate',
    startDate: '0395-01-17',
    summary: 'Test whether the Western Roman Empire can survive migration, fiscal stress, military fragmentation, and succession.',
    grade: 'Grade 8+',
    difficulty: 'Strategist',
    aiReason: 'Long-horizon state capacity makes it ideal for watching lower-level demographic and economic effects compound.',
    nations: ['western-rome', 'eastern-rome', 'visigoths'],
  },
  {
    id: 'prevent-wwi',
    title: 'Can You Prevent WWI?',
    subtitle: 'July 1914',
    category: 'Education',
    startDate: '1914-07-23',
    summary: 'Try to preserve strategic interests while preventing the alliance system from producing a general European war.',
    grade: 'Grade 9–12',
    difficulty: 'Advanced',
    aiReason: 'A diplomacy challenge with strong path dependence and excellent counterfactual teaching value.',
    nations: ['austria-hungary', 'germany', 'russia', 'france', 'uk', 'serbia'],
  },
  {
    id: 'mars-2140',
    title: 'Mars 2140',
    subtitle: 'Science Fiction',
    category: 'Sci-Fi',
    startDate: '2140-03-01',
    summary: 'Competing settlements manage oxygen, water, energy, research, and political legitimacy on a fragile planet.',
    grade: 'Open',
    difficulty: 'Intermediate',
    aiReason: 'The same population, resource, diplomacy, and technology engine can prove the platform is not limited to history.',
    nations: ['ares-union', 'nova-commonwealth', 'red-frontier'],
  },
];

function baseNations() {
  return {
    france: nation('france', 'France', '#4e72c2', { population: 47, economy: 72, military: 70, stability: 74, technology: 77, relations: { usa: 71, uk: 68, ussr: -49 } }),
    usa: nation('usa', 'United States', '#2f67b2', { population: 186, economy: 94, military: 94, stability: 79, technology: 95, relations: { france: 71, uk: 82, ussr: -78, cuba: -91 } }),
    ussr: nation('ussr', 'Soviet Union', '#b84c4c', { population: 220, economy: 78, military: 93, stability: 73, technology: 90, relations: { usa: -78, france: -49, cuba: 84 } }),
    cuba: nation('cuba', 'Cuba', '#d99e45', { population: 7, economy: 42, military: 54, stability: 69, technology: 48, food: 58, relations: { ussr: 84, usa: -91 } }),
    uk: nation('uk', 'United Kingdom', '#825fb5', { population: 53, economy: 76, military: 79, stability: 78, technology: 81, relations: { usa: 82, france: 68 } }),
    germany: nation('germany', 'Germany', '#6a7180', { population: 79, economy: 83, military: 90, stability: 75, technology: 86, relations: { poland: -88, france: -77, uk: -74 } }),
    poland: nation('poland', 'Poland', '#c15f85', { population: 35, economy: 52, military: 58, stability: 68, technology: 59, relations: { germany: -88, france: 68, uk: 62 } }),
    italy: nation('italy', 'Italy', '#5d9b6f', { population: 44, economy: 59, military: 68, stability: 66, technology: 64, relations: { germany: 54, france: -22, uk: -18 } }),
    'western-rome': nation('western-rome', 'Western Roman Empire', '#8c4f8d', { population: 45, economy: 43, military: 61, stability: 38, technology: 52, food: 55 }),
    'eastern-rome': nation('eastern-rome', 'Eastern Roman Empire', '#9a6fc2', { population: 48, economy: 66, military: 68, stability: 72, technology: 58, food: 69 }),
    visigoths: nation('visigoths', 'Visigoths', '#b98252', { population: 9, economy: 34, military: 64, stability: 63, technology: 39, food: 57 }),
    'austria-hungary': nation('austria-hungary', 'Austria-Hungary', '#b86d8f', { population: 52, economy: 61, military: 71, stability: 52, technology: 66 }),
    russia: nation('russia', 'Russia', '#a54e53', { population: 175, economy: 57, military: 78, stability: 54, technology: 61 }),
    serbia: nation('serbia', 'Serbia', '#7f86bf', { population: 4, economy: 39, military: 53, stability: 64, technology: 45 }),
    'ares-union': nation('ares-union', 'Ares Union', '#d85b4e', { population: 12, economy: 70, military: 62, stability: 67, technology: 92, food: 42 }),
    'nova-commonwealth': nation('nova-commonwealth', 'Nova Commonwealth', '#4a8ec9', { population: 9, economy: 76, military: 48, stability: 76, technology: 95, food: 51 }),
    'red-frontier': nation('red-frontier', 'Red Frontier', '#d09a4a', { population: 6, economy: 57, military: 72, stability: 58, technology: 88, food: 46 }),
  };
}

export function getPreset(id) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];
}

export function createInitialWorld(presetId = PRESETS[0].id) {
  const preset = getPreset(presetId);
  const all = baseNations();
  const selected = Object.fromEntries(preset.nations.map((id) => [id, structuredClone(all[id])]).filter(([, value]) => value));
  return {
    presetId: preset.id,
    date: preset.startDate,
    day: 0,
    seed: 1337,
    tension: preset.id === 'cuban-missile-crisis' ? 82 : preset.id === 'prevent-wwi' ? 76 : 55,
    globalEconomy: 66,
    climateStress: 22,
    nations: selected,
    events: [],
    history: [],
  };
}
