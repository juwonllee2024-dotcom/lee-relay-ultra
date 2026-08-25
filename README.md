# Lee Relay Ultra v1.1.0

![Lee Relay Ultra logo](extension/assets/lee-relay-ultra-logo.png)

Separate coding product for bounded Planner → Implementer → Reviewer → Tester
workflows. Lee Relay v4.3.0 is not modified.

## Why Lee Relay Ultra is different

- **It is an execution plane, not another chat room.** AI roles can plan, edit files, run terminal commands, build, test, review diffs, and roll back within one declared workspace.
- **The company metaphor is executable.** Planner, Implementer, Reviewer, and Tester are explicit roles with workflow-specific capabilities instead of a single general-purpose agent prompt.
- **Autonomy is bounded at the host.** Workspace containment, command-deny rules, role capabilities, step/command/retry/time limits, Pause, Resume, and Stop are enforced by the local server rather than left to model obedience.
- **It uses observed-evidence turns.** Browse Code-style prompts, one-action-per-turn protocol, response-stability waits, malformed-action recovery, and result feedback keep coding loops synchronized with real tool results.
- **Publishing remains a deliberate human boundary.** Merge and push are never automatic in v1, even when Auto Coding is enabled.

Where a normal coding chat suggests changes, Ultra carries a bounded change through the full Planner → Implementer → Reviewer → Tester loop and leaves an inspectable result.

## What is included

- Local Express host based on the proven Default Project execution layer.
- Workspace boundary checks for paths and process cwd values.
- Command policy that denies publishing and destructive commands before spawn.
- File read/write/edit, PowerShell, test/build, backup, diff, and rollback tools.
- Default roles: Planner, Implementer, Reviewer, Tester.
- Coding, Review, and Bug Fix workflows.
- Step, command, retry, and wall-clock Loop Guard.
- Authenticated `/ultra/*` run API with Auto Coding, Pause, Resume, and Stop.
- Browse Code style observed-evidence prompt and one-action-per-turn protocol.
- `<tool='terminal_run'>...</tool>` compatibility mapped to the bounded local terminal.
- Response-stability waiting, malformed/multiple-action recovery, and result feedback.
- Chrome MV3 Side Panel controls that preserve the existing manual ChatGPT mode.

## Start

1. Set `AGENT_TOKEN` to a long random local value and `AGENT_CWD` to the
   project root the agent may touch. The root must exist.
2. From `server/`, run `npm install` and `npm start`.
3. Load exactly the `extension/` folder as an unpacked extension at
   `chrome://extensions` (the folder selected in the file picker must contain
   `manifest.json`; do not select the ZIP or the repository root).
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

See [ULTRA_SYSTEM_PROMPT.md](ULTRA_SYSTEM_PROMPT.md), the [design spec](docs/superpowers/specs/2026-08-24-lee-relay-ultra-v1-design.md), and the [v1.1.0 release checklist](docs/release/v1.1.0-checklist.md).
