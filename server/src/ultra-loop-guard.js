function guardError(reason) {
  const error = new Error(`Ultra loop guard stopped the run: ${reason}`);
  error.code = 'E_LOOP_GUARD';
  error.reason = reason;
  return error;
}

function positiveLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function createLoopGuard({ maxSteps = 24, maxCommands = 80, maxMinutes = 30, maxRetries = 4, now = Date.now } = {}) {
  const limits = Object.freeze({
    maxSteps: positiveLimit(maxSteps, 24),
    maxCommands: positiveLimit(maxCommands, 80),
    maxMinutes: positiveLimit(maxMinutes, 30),
    maxRetries: positiveLimit(maxRetries, 4),
  });
  const state = { steps: 0, commands: 0, retries: 0, startedAt: now(), stopped: null };

  function stopReason() {
    if (state.stopped) return state.stopped;
    if (state.steps >= limits.maxSteps) return 'max_steps';
    if (state.commands >= limits.maxCommands) return 'max_commands';
    if (state.retries >= limits.maxRetries) return 'max_retries';
    if (now() - state.startedAt >= limits.maxMinutes * 60 * 1000) return 'max_minutes';
    return null;
  }

  function consume(field, limitKey) {
    const reason = stopReason();
    if (reason) {
      state.stopped = state.stopped || reason;
      throw guardError(reason);
    }
    state[field] += 1;
    return state[field];
  }

  return Object.freeze({
    consumeStep: () => consume('steps', 'maxSteps'),
    consumeCommand: () => consume('commands', 'maxCommands'),
    consumeRetry: () => consume('retries', 'maxRetries'),
    stop: (reason = 'stopped') => { state.stopped = String(reason); },
    stopReason,
    snapshot: () => ({
      ...state,
      limits,
      elapsedMs: Math.max(0, now() - state.startedAt),
      stopped: stopReason(),
    }),
  });
}

module.exports = { createLoopGuard };
