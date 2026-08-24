# Lee Relay Ultra v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lee-relay-ultra-v1.0.0` as a separate local coding orchestrator using the Default Project execution layer with bounded Planner, Implementer, Reviewer, and Tester roles.

**Architecture:** Keep the existing Express tool server as the execution boundary, extract policy and workflow logic into small modules, and expose authenticated `/ultra/*` endpoints. The Chrome side panel remains a provider bridge and gains a single-run Auto Coding control plus pause/stop state.

**Tech Stack:** Node.js CommonJS, Express, Node built-in test runner, Chrome MV3 extension, PowerShell on Windows.

**Spec:** `docs/superpowers/specs/2026-08-24-lee-relay-ultra-v1-design.md`

## Global Constraints

- Product version is `lee-relay-ultra-v1.0.0`; Lee Relay v4.1.1 is untouched.
- All paths and process cwd values must remain under the configured workspace root.
- Auto Coding is one explicit per-run grant; pause and stop remain available.
- No automatic merge, push, deletion, or destructive command in v1.
- Runtime data under `server/data/` is ignored and never packaged as source.
- New production behavior follows TDD: write a failing test, observe the failure, then implement the minimum code.

---

### Task 1: Repository hygiene and copied execution baseline

**Files:**
- Create: `.gitignore`
- Modify: `server/package.json`
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-08-24-lee-relay-ultra-v1-design.md`

**Interfaces:**
- Produces a clean repository without `server/node_modules`, `server/data`, logs, or secrets.
- Keeps the copied Default Project tests runnable with `npm test` from `server/`.

- [x] Copy only source, extension, skills, plugins, tests, and documentation from Default Project.
- [x] Add ignore rules for runtime data, dependencies, logs, secrets, and packages.
- [ ] Rename the server package and add `test:unit` and `test:all` scripts after the new unit tests exist.
- [ ] Run `npm install` and the copied baseline test suite.

### Task 2: Workspace and execution policy

**Files:**
- Create: `server/src/ultra-policy.js`
- Test: `server/test/unit/ultra-policy.test.js`
- Modify: `server/server.js`

**Interfaces:**
- `createWorkspacePolicy({ root, token, autoCoding })` returns `{ root, assertPath, assertCwd, assertCommand, canRun }`.
- `assertPath(candidate)` returns the resolved path or throws `E_WORKSPACE_BOUNDARY`.
- `assertCommand(command, role)` returns the command or throws a typed policy error.
- `canRun({ role, autoCoding, action })` returns `{ allowed, reason }`.

- [ ] Write a test proving a path outside the workspace is rejected after resolution.
- [ ] Write a test proving a PowerShell cwd outside the workspace is rejected.
- [ ] Write a test proving merge/push/delete commands are denied by default.
- [ ] Write a test proving write/terminal actions require the per-run Auto Coding grant.
- [ ] Run `node --test test/unit/ultra-policy.test.js` and observe the expected missing-module failure.
- [ ] Implement path containment, command deny rules, role capability checks, and process-local token fallback.
- [ ] Run the unit test again and then the copied integration suite.

### Task 3: Roles, workflows, and Loop Guard

**Files:**
- Create: `server/src/ultra-roles.js`
- Create: `server/src/ultra-workflows.js`
- Create: `server/src/ultra-loop-guard.js`
- Test: `server/test/unit/ultra-workflow.test.js`

**Interfaces:**
- `listRoles()` returns the four default role definitions.
- `listWorkflows()` returns `coding`, `review`, and `bugfix` workflow definitions.
- `createLoopGuard({ maxSteps, maxCommands, maxMinutes, maxRetries })` returns `snapshot()`, `consumeStep()`, `consumeCommand()`, `consumeRetry()`, and `stopReason()`.
- `createWorkflowRun({ runId, workflowId, task, roleIds, guard })` returns a serializable state machine with `currentStep()`, `advance(result)`, `pause()`, `resume()`, and `stop()`.

- [ ] Write tests for the default roles and their capabilities.
- [ ] Write tests for step, command, retry, and time limits.
- [ ] Write tests for implementer → reviewer → tester routing and bounded retry.
- [ ] Run the test and observe failure before implementation.
- [ ] Implement the pure role registry, workflow definitions, and state machine.
- [ ] Run unit tests and verify serialized state contains no secrets.

### Task 4: Ultra run API

**Files:**
- Create: `server/src/ultra-runs.js`
- Modify: `server/server.js`
- Test: `server/test/ultra-api.test.js`

**Interfaces:**
- `POST /ultra/runs` accepts `{ task, cwd, workflowId, autoCoding, limits }` and returns `202` plus `{ runId, state }`.
- `GET /ultra/runs/:runId` returns the current state and guard snapshot.
- `POST /ultra/runs/:runId/pause`, `/resume`, `/stop`, and `/advance` update only the authenticated run.
- Every mutating endpoint requires `x-agent-token` and rejects an absent auto-coding grant for write workflows.

- [ ] Write integration tests for create, read, pause, resume, stop, and guard rejection.
- [ ] Run the new test and observe failure.
- [ ] Implement the in-memory run registry with persistence hooks compatible with existing sessions.
- [ ] Mount the endpoints without changing legacy `/tools` response shapes.
- [ ] Run all server and extension tests.

### Task 5: Extension Auto Coding controls

**Files:**
- Modify: `extension/sidepanel.html`
- Modify: `extension/sidepanel.js`
- Modify: `extension/sidepanel.css`
- Modify: `extension/content.js`
- Test: `extension/content.test.js`

**Interfaces:**
- Side panel exposes one `Auto Coding` toggle, `Pause`, and `Stop` controls.
- The current active ChatGPT tab remains the provider bridge.
- The panel sends run state to the host and never hides the kill switch.

- [ ] Add failing content tests for pause/stop messages and run-state transitions.
- [ ] Implement minimal UI/state handling.
- [ ] Verify disabled state, refresh recovery, and legacy manual mode.
- [ ] Run extension tests and server tests together.

### Task 6: Release verification and v1.0.0 package

**Files:**
- Modify: `README.md`
- Modify: `SYSTEM_PROMPT.md`
- Create: `.env.example`
- Create: `docs/release/v1.0.0-checklist.md`

- [ ] Run the full test command from a clean dependency install.
- [ ] Run a smoke test that starts the host on a random local port and stops it.
- [ ] Verify no runtime data, secrets, or `node_modules` are tracked.
- [ ] Verify extension manifest loads and reports version `1.0.0`.
- [ ] Create a source ZIP without runtime data and record SHA-256.
- [ ] Report only claims supported by fresh command output.
