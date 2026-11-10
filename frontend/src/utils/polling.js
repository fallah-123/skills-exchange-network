const defaultClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

export function isRetryableRead(error) {
  return ['NETWORK_ERROR', 'REQUEST_TIMEOUT'].includes(error.code) ||
    error.status === 408 || error.status === 429 || error.status >= 500;
}

// Schedule after completion so slow requests never overlap. Reads only: sends
// retain explicit, idempotent user retries.
export function createPollingTask({ run, onStatus = () => {}, intervalMs,
  timeoutMs = 15000, maxRetryMs = 30000, clock = defaultClock }) {
  let active = false;
  let pausedPhase = 'paused';
  let stopped = false;
  let terminal = false;
  let terminalStatus = null;
  let timer = null;
  let flight = null;
  let failures = 0;
  let retryNotBefore = 0;

  function clearScheduled() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function schedule(delay) {
    clearScheduled();
    if (active && !stopped && !terminal) timer = clock.setTimeout(() => { timer = null; tick(); }, delay);
  }
  function tick(foreground = false) {
    if ((!active && !foreground) || stopped || terminal) return Promise.resolve();
    if (flight) {
      // An explicit open/refresh must not inherit a cancelled background read.
      if (foreground && flight.controller.signal.aborted) return flight.promise.then(() => tick(true));
      if (foreground) flight.foreground = true;
      return flight.promise;
    }
    const wait = retryNotBefore - clock.now();
    if (wait > 0) { schedule(wait); return Promise.resolve(); }
    clearScheduled();
    const controller = new AbortController();
    const current = { controller, promise: null, foreground };
    flight = current;
    let timedOut = false;
    let delay = intervalMs;
    const deadline = clock.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    current.deadline = deadline;
    current.promise = Promise.resolve()
      .then(() => { controller.signal.throwIfAborted(); return run(controller.signal); })
      .then((more) => {
        if (controller.signal.aborted || stopped) return;
        failures = 0;
        retryNotBefore = 0;
        delay = more === true ? 0 : intervalMs;
        onStatus({ phase: active ? 'live' : pausedPhase });
      })
      .catch((failure) => {
        if (stopped || (!timedOut && controller.signal.aborted)) return;
        const error = timedOut
          ? Object.assign(new Error('The connection is taking too long.'), { code: 'REQUEST_TIMEOUT' })
          : failure;
        if (isRetryableRead(error)) {
          failures += 1;
          delay = Math.max(Math.min(intervalMs * 2 ** Math.min(failures, 10), maxRetryMs), (error.retryAfter || 0) * 1000);
          retryNotBefore = clock.now() + delay;
          if (active || current.foreground) onStatus({ phase: 'retrying', error, delay });
        } else {
          terminal = true;
          terminalStatus = { phase: 'error', error };
          onStatus(terminalStatus);
        }
      })
      .finally(() => {
        clock.clearTimeout(deadline);
        controller.abort(); // Cancel siblings left over after a Promise.all failure.
        if (flight === current) flight = null;
        if (active && !stopped && !terminal) schedule(current.wake ? 0 : delay);
      });
    return current.promise;
  }

  return {
    refresh() {
      if (stopped) return Promise.resolve();
      terminal = false;
      terminalStatus = null;
      return tick(true);
    },
    resume() {
      if (stopped || active) return;
      active = true;
      if (terminal) { onStatus(terminalStatus); return; }
      if (flight) flight.wake = true;
      else tick();
    },
    pause(phase = 'paused') {
      if (stopped) return;
      active = false;
      pausedPhase = phase;
      clearScheduled();
      if (flight && !flight.foreground) {
        clock.clearTimeout(flight.deadline);
        flight.controller.abort();
      }
      onStatus({ phase });
    },
    stop() {
      stopped = true;
      active = false;
      clearScheduled();
      if (flight) clock.clearTimeout(flight.deadline);
      flight?.controller.abort();
    },
  };
}

export function bindPollingLifecycle(task, environment = { document, window, navigator }) {
  const { document: page, window: browser, navigator: network } = environment;
  function update() {
    if (network.onLine === false) task.pause('offline');
    else if (page.visibilityState === 'hidden') task.pause('paused');
    else task.resume();
  }
  page.addEventListener('visibilitychange', update);
  browser.addEventListener('online', update);
  browser.addEventListener('offline', update);
  update();
  return () => {
    page.removeEventListener('visibilitychange', update);
    browser.removeEventListener('online', update);
    browser.removeEventListener('offline', update);
    task.stop();
  };
}

// Advance only after applying each fetched page. A send response never touches this cursor.
export function createHistoryReader({ after, fetchPage, onPage, maxPages = 10 }) {
  let cursor = after;
  return async (signal) => {
    for (let page = 0; page < maxPages; page += 1) {
      signal.throwIfAborted();
      const result = await fetchPage(cursor, signal);
      signal.throwIfAborted();
      const next = result.meta.nextAfter;
      if (typeof next !== 'string' || !/^(0|[1-9]\d*)$/.test(next) || BigInt(next) < BigInt(cursor) ||
          (result.meta.hasMore && BigInt(next) <= BigInt(cursor))) {
        throw new Error('The server returned an invalid message cursor. Refresh the conversation.');
      }
      onPage(result);
      cursor = next;
      if (!result.meta.hasMore) return false;
    }
    return true;
  };
}

export function pollingLabel(status) {
  if (status.phase === 'offline') return 'You’re offline. Updates will resume when you reconnect.';
  if (status.phase === 'paused') return 'Updates paused while this tab is hidden.';
  if (status.phase === 'retrying') return 'Connection interrupted. Retrying automatically…';
  if (status.phase === 'error') return 'Updates stopped. Use Refresh to try again.';
  if (status.phase === 'connecting') return 'Connecting…';
  return 'Checking for new messages automatically';
}
