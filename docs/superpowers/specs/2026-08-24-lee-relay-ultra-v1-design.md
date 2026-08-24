# Lee Relay Ultra v1 Design

## Goal

Turn the local execution layer from `Default Project` into a separate coding
product that can run a bounded Planner → Implementer → Reviewer → Tester
workflow without per-step approval, while keeping a user-controlled pause and
stop switch.

## Product boundary

`lee-relay-ultra-v1` is a separate product. Lee Relay v4.1.1 and its meeting
workflow are not modified. The existing Default Project is used only as the
initial local execution implementation; its runtime data and dependencies are
not copied into the repository.

## Architecture

```text
Chrome side panel / future provider adapters
                │ authenticated JSON API
                ▼
        Ultra host server
        ├─ policy and workspace boundary
        ├─ workflow engine
        ├─ role registry
        ├─ loop/time/command guard
        └─ existing file + PowerShell tools
                │
                ▼
        isolated Git worktree
```

The host server remains local. Agent providers are adapters: an adapter sends
the current step prompt to a selected AI tab or API and returns a structured
agent message. The workflow engine never needs to know how a provider talks to
its model.

## Default roles

- `planner`: read-only inspection, plan, acceptance criteria.
- `implementer`: file edits, terminal commands, build commands.
- `reviewer`: read-only diff review and issue list; no merge/push.
- `tester`: test/build execution and failure report; no merge/push.

Each role has an explicit capability set. Auto Coding means the user enables a
run once; it does not remove the policy boundary, role capabilities, loop
guard, pause switch, or stop switch.

## Workflow

1. Create a run with task, workspace root, workflow id, and guard limits.
2. Planner produces a plan.
3. Implementer applies changes in the isolated worktree.
4. Reviewer checks the diff and either approves or returns findings.
5. Tester runs the configured checks.
6. A failed review/test returns to Implementer only while the guard permits it.
7. Completion produces a report. Merge and push are never automatic in v1.

## Safety invariants

- Every file path must stay under the configured workspace root after
  `realpath` resolution.
- Every process cwd must be under that same root.
- A run requires an explicit per-run auto-coding grant and an authenticated
  local token.
- The server must not use a hard-coded production token when an environment
  token is absent; development mode generates a process-local token.
- PowerShell commands are noninteractive and timeout-bound.
- A guard stops a run when it reaches max steps, max commands, max retries, or
  max wall-clock time.
- Runtime sessions, backups, command output, and secrets remain outside Git.
- Main-branch merge, push, deletion, and destructive commands are denied by
  default.

## v1 API surface

- `GET /ultra/health`
- `GET /ultra/roles`
- `GET /ultra/workflows`
- `POST /ultra/runs`
- `GET /ultra/runs/:runId`
- `POST /ultra/runs/:runId/pause`
- `POST /ultra/runs/:runId/resume`
- `POST /ultra/runs/:runId/stop`
- `POST /ultra/runs/:runId/advance`

The existing `/tools/*` API stays available to the copied bridge while its
authorization and workspace checks are hardened.

## Non-goals for v1.0.0

- Automatic GitHub push or main-branch merge.
- Hidden background control of third-party AI tabs.
- Replacing provider-specific browser bridges.
- Claiming zero bugs; release requires test evidence and a visible kill switch.
