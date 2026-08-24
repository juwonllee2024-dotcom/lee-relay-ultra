# Lee Relay Ultra v1

Separate coding product for bounded Planner → Implementer → Reviewer → Tester
workflows. Lee Relay v4.1.1 is not modified.

## What is included

- Local Express host based on the proven Default Project execution layer.
- Workspace boundary checks for paths and process cwd values.
- Command policy that denies publishing and destructive commands before spawn.
- File read/write/edit, PowerShell, test/build, backup, diff, and rollback tools.
- Default roles: Planner, Implementer, Reviewer, Tester.
- Coding, Review, and Bug Fix workflows.
- Step, command, retry, and wall-clock Loop Guard.
- Authenticated `/ultra/*` run API with Auto Coding, Pause, Resume, and Stop.
- Chrome MV3 Side Panel controls that preserve the existing manual ChatGPT mode.

## Start

1. Set `AGENT_TOKEN` to a long random local value and `AGENT_CWD` to the
   project root the agent may touch. The root must exist.
2. From `server/`, run `npm install` and `npm start`.
3. Load `extension/` as an unpacked extension at `chrome://extensions`.
4. Open a ChatGPT tab, open the Side Panel, set the same workspace path, and
   enable the existing Execution Control.
5. Enable `ULTRA AUTO CODING`, choose a workflow, and send a task.

The user grants Auto Coding once per run. The host still enforces role
capabilities, workspace boundaries, Loop Guard limits, Pause, and Stop. Merge
and push are never automatic in v1.

## API

- `GET /ultra/health`
- `GET /ultra/roles`
- `GET /ultra/workflows`
- `POST /ultra/runs`
- `GET /ultra/runs/:runId`
- `POST /ultra/runs/:runId/pause`
- `POST /ultra/runs/:runId/resume`
- `POST /ultra/runs/:runId/stop`
- `POST /ultra/runs/:runId/advance`

Mutating endpoints require the `X-Agent-Token` header. Runtime data is created
under `server/data/` and intentionally ignored by Git.

## Tests

```powershell
cd server
npm install
npm test
```

See [ULTRA_SYSTEM_PROMPT.md](ULTRA_SYSTEM_PROMPT.md), the [design spec](docs/superpowers/specs/2026-08-24-lee-relay-ultra-v1-design.md), and the [release checklist](docs/release/v1.0.0-checklist.md).
