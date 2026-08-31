# History Lab — AI Civilization Sandbox MVP

A playable vertical slice of an AI-native historical/world simulation platform inspired by the strongest interaction ideas in Pax-style grand strategy and living-world god games, but designed around one strict rule:

> **AI proposes decisions. The deterministic simulator owns the world.**

This MVP runs with **zero external dependencies and zero API keys**. It is a static ES-module app, so it can run locally or on GitHub Pages without a backend.

## What works

- Preset library with historical, educational, alternate-history, and science-fiction worlds.
- Human + up to two independent AI players.
- AI personality and historical-knowledge setup controls.
- Map-first simulation UI with Political, Population, Economy, Military, and Stability layers.
- Natural-language action composer that interprets plans into structured action objects.
- Era/authority validation before world mutation.
- Seeded deterministic simulation.
- AI players use the exact same structured action + validation + simulation API as the human.
- Public AI status/rationale display without chain-of-thought.
- Canonical world event timeline and causal “Why?” breakdowns.
- Counterfactual comparison panel.
- God Mode interventions recorded separately from organic simulation events.
- `localStorage` resume support.
- Responsive desktop/mobile UI.

## Run

```bash
npm test
npm run dev
# open http://127.0.0.1:4173
```

No `npm install` is required.

## Build

```bash
npm run build
```

This copies the static app to `dist/`.

## Architecture

```text
Human / AI decision
        ↓
Action interpreter
        ↓
Validation
        ↓
Structured action
        ↓
Deterministic world simulator
        ↓
Canonical WorldState + WorldEvent
        ↓
Narrative / education UI
```

Important modules:

```text
src/core/presets.js             canonical preset + initial world data
src/core/action-interpreter.js  natural language → structured action(s)
src/core/simulation.js          validation + authoritative mutation + background ticks
src/core/ai-agent.js            AI policy adapter; only proposes actions
src/core/turn.js                shared human/AI turn orchestration
src/core/rng.js                 deterministic seeded randomness
src/ui/templates.js             pure HTML renderers + world map
src/app.js                      UI event wiring / persistence
```

## AI integration boundary

A future OpenAI/Claude/Gemini/Hermes adapter should replace `chooseAIAction()` with a provider-backed implementation that receives only the AI player’s filtered world view and returns a `StructuredAction`. It must **not** receive direct access to mutable canonical tables/state.

## Next production slices

1. MapLibre/PMTiles world + province LOD and real border ownership.
2. Structured treaties and private AI-to-AI diplomatic channels.
3. Two-layer civilization simulation (population/resources/cities below grand strategy).
4. Scenario/preset creator with vector map editor.
5. Branch/rewind timeline graph and sourced historical comparison records.
6. Classroom rooms + teacher dashboard.
7. Postgres/WebSocket backend and provider-backed AI orchestration.
