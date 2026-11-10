import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPollingLifecycle, createHistoryReader, createPollingTask } from '../src/utils/polling.js';
import { mergeMessages } from '../src/utils/messaging.js';

async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }
function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(callback, delay) { const key = ++id; timers.set(key, { at: now + delay, callback }); return key; },
    clearTimeout(key) { timers.delete(key); },
    get pending() { return timers.size; },
    async advance(duration) {
      const end = now + duration;
      for (;;) {
        await flush();
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
      await flush();
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('polls immediately, then every interval after completion; stop removes timers', async () => {
  const clock = fakeClock();
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, run: async () => { reads += 1; } });
  task.resume();
  await flush();
  assert.equal(reads, 1);
  await clock.advance(2999);
  assert.equal(reads, 1);
  await clock.advance(1);
  assert.equal(reads, 2);
  task.stop();
  assert.equal(clock.pending, 0);
  await clock.advance(10000);
  assert.equal(reads, 2);
});

test('opening a chat loads immediately even when an embedded preview reports hidden', async () => {
  const clock = fakeClock();
  const page = new EventTarget();
  page.visibilityState = 'hidden';
  const browser = new EventTarget();
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, run: async () => { reads += 1; } });
  const cleanup = bindPollingLifecycle(task, { document: page, window: browser, navigator: { onLine: true } });
  await flush();
  assert.equal(reads, 0);
  await task.refresh();
  assert.equal(reads, 1);
  await clock.advance(10000);
  assert.equal(reads, 1, 'No hidden-tab background loop follows the explicit load');
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(reads, 2);
  cleanup();
});

test('losing visibility does not cancel the initial history request or require another click', async () => {
  const clock = fakeClock();
  const pending = deferred();
  let signal;
  const task = createPollingTask({ clock, intervalMs: 3000, run: (value) => { signal = value; return pending.promise; } });
  task.resume();
  const opening = task.refresh();
  await flush();
  task.pause();
  assert.equal(signal.aborted, false);
  pending.resolve();
  await opening;
  assert.equal(clock.pending, 0);
  task.stop();
});

test('explicit refresh after an aborted background read starts a new history request', async () => {
  const clock = fakeClock();
  const pending = deferred();
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, run: () => ++reads === 1 ? pending.promise : Promise.resolve() });
  task.resume();
  await flush();
  task.pause();
  const refreshing = task.refresh();
  pending.reject(new DOMException('Aborted', 'AbortError'));
  await refreshing;
  assert.equal(reads, 2);
  task.stop();
});

test('switching accounts cancels even an explicit foreground history load', async () => {
  const clock = fakeClock();
  const pending = deferred();
  let signal;
  const statuses = [];
  const task = createPollingTask({ clock, intervalMs: 3000, run: (value) => { signal = value; return pending.promise; }, onStatus: (value) => statuses.push(value) });
  const opening = task.refresh();
  await flush();
  task.stop();
  assert.equal(signal.aborted, true);
  pending.resolve();
  await opening;
  assert.deepEqual(statuses, []);
  assert.equal(clock.pending, 0);
});

test('slow reads, repeated resume, and manual refresh never overlap', async () => {
  const clock = fakeClock();
  const pending = deferred();
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 1000, run: () => { reads += 1; return pending.promise; } });
  task.resume();
  await flush();
  task.resume();
  task.refresh();
  task.refresh();
  await clock.advance(4000);
  assert.equal(reads, 1);
  pending.resolve();
  await flush();
  await clock.advance(999);
  assert.equal(reads, 1);
  task.stop();
});

test('pause aborts inflight work, ignores late results, and resume catches up immediately', async () => {
  const clock = fakeClock();
  const pending = deferred();
  const statuses = [];
  let signal, reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, onStatus: (status) => statuses.push(status.phase), run: (value) => { signal = value; reads += 1; return reads === 1 ? pending.promise : Promise.resolve(); } });
  task.resume();
  await flush();
  task.pause('offline');
  assert.equal(signal.aborted, true);
  task.resume();
  pending.resolve();
  await clock.advance(0);
  assert.equal(reads, 2);
  assert.deepEqual(statuses, ['offline', 'live']);
  task.stop();
});

test('network failures back off to 30 seconds and successful reads reset the delay', async () => {
  const clock = fakeClock();
  const delays = [];
  let fail = true, reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000,
    onStatus: (status) => { if (status.delay) delays.push(status.delay); },
    run: async () => { reads += 1; if (fail) throw { code: 'NETWORK_ERROR' }; },
  });
  task.resume();
  await flush();
  for (const delay of [6000, 12000, 24000, 30000]) await clock.advance(delay);
  assert.deepEqual(delays, [6000, 12000, 24000, 30000, 30000]);
  fail = false;
  await clock.advance(30000);
  const recoveredReads = reads;
  await clock.advance(3000);
  assert.equal(reads, recoveredReads + 1);
  fail = true;
  await clock.advance(3000);
  assert.equal(delays.at(-1), 6000);
  task.stop();
});

test('Retry-After is respected across refresh and visibility changes', async () => {
  const clock = fakeClock();
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, run: async () => { reads += 1; throw { status: 429, retryAfter: 60 }; } });
  task.resume();
  await flush();
  await clock.advance(1000);
  await task.refresh();
  task.pause();
  task.resume();
  await clock.advance(58999);
  assert.equal(reads, 1);
  await clock.advance(1);
  assert.equal(reads, 2);
  task.stop();
});

test('a hung fetch is aborted at the deadline and retried with backoff', async () => {
  const clock = fakeClock();
  const statuses = [];
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, timeoutMs: 1000,
    onStatus: (status) => statuses.push(status),
    run: (signal) => { reads += 1; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); },
  });
  task.resume();
  await clock.advance(1000);
  assert.equal(statuses[0].error.code, 'REQUEST_TIMEOUT');
  await clock.advance(6000);
  assert.equal(reads, 2);
  task.stop();
  await flush();
  assert.equal(clock.pending, 0);
});

test('permission and validation failures stop polling rather than retrying forever', async () => {
  for (const status of [400, 401, 403, 404]) {
    const clock = fakeClock();
    let reads = 0;
    const task = createPollingTask({ clock, intervalMs: 3000, run: async () => { reads += 1; throw { status }; } });
    task.resume();
    await flush();
    await clock.advance(60000);
    assert.equal(reads, 1);
    await task.refresh();
    assert.equal(reads, 2);
    task.stop();
  }
});

test('stop during a request prevents late status updates and future work', async () => {
  const clock = fakeClock();
  const pending = deferred();
  const statuses = [];
  const task = createPollingTask({ clock, intervalMs: 3000, run: () => pending.promise, onStatus: (status) => statuses.push(status) });
  task.resume();
  await flush();
  task.stop();
  assert.equal(clock.pending, 0);
  pending.reject({ status: 503 });
  await flush();
  task.resume();
  await task.refresh();
  assert.deepEqual(statuses, []);
  assert.equal(clock.pending, 0);
});

test('backlogged history schedules its next bounded batch immediately', async () => {
  const clock = fakeClock();
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, run: async () => ++reads < 3 });
  task.resume();
  await clock.advance(0);
  assert.equal(reads, 3);
  await clock.advance(2999);
  assert.equal(reads, 3);
  task.stop();
});

test('returning to a tab preserves a terminal error without silently restarting reads', async () => {
  const clock = fakeClock();
  const phases = [];
  let reads = 0;
  const task = createPollingTask({ clock, intervalMs: 3000, run: async () => { reads += 1; throw { status: 400 }; }, onStatus: (status) => phases.push(status.phase) });
  task.resume();
  await flush();
  task.pause();
  task.resume();
  await clock.advance(30000);
  assert.deepEqual(phases, ['error', 'paused', 'error']);
  assert.equal(reads, 1);
  task.stop();
});

test('lifecycle pauses hidden/offline tabs, resumes on return, and removes listeners', () => {
  const page = new EventTarget();
  const browser = new EventTarget();
  const network = { onLine: true };
  page.visibilityState = 'visible';
  const events = [];
  const task = { resume: () => events.push('resume'), pause: (phase) => events.push(phase), stop: () => events.push('stop') };
  const cleanup = bindPollingLifecycle(task, { document: page, window: browser, navigator: network });
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  network.onLine = false;
  browser.dispatchEvent(new Event('offline'));
  network.onLine = true;
  browser.dispatchEvent(new Event('online'));
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  cleanup();
  page.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('online'));
  assert.deepEqual(events, ['resume', 'paused', 'offline', 'paused', 'resume', 'stop']);
});

test('history drains all pages using exact bigint cursors without duplicate send results', async () => {
  const start = '9007199254740993';
  const ids = ['9007199254740994', '9007199254740995', '9007199254740996'];
  let messages = [{ id: ids[2], body: 'Own send already displayed' }];
  const cursors = [];
  const reader = createHistoryReader({ after: start, maxPages: 2,
    async fetchPage(cursor) {
      cursors.push(cursor);
      const index = cursors.length - 1;
      return { data: [{ id: ids[index] }], meta: { nextAfter: ids[index], hasMore: index < 2 } };
    },
    onPage: (result) => { messages = mergeMessages(messages, result.data); },
  });
  const signal = new AbortController().signal;
  assert.equal(await reader(signal), true);
  assert.equal(await reader(signal), false);
  assert.deepEqual(cursors, [start, ids[0], ids[1]]);
  assert.deepEqual(messages.map((message) => message.id), ids);
});

test('a failed later page resumes at the last successfully applied cursor', async () => {
  const cursors = [];
  let fail = true;
  const reader = createHistoryReader({ after: '0', onPage() {}, async fetchPage(cursor) {
    cursors.push(cursor);
    if (cursor === '1' && fail) throw new Error('offline');
    return { data: [], meta: { nextAfter: cursor === '0' ? '1' : '2', hasMore: cursor === '0' } };
  } });
  const signal = new AbortController().signal;
  await assert.rejects(reader(signal), /offline/);
  fail = false;
  await reader(signal);
  assert.deepEqual(cursors, ['0', '1', '1']);
});

test('late history from a switched conversation is never applied', async () => {
  const controller = new AbortController();
  const pending = deferred();
  let applied = false;
  const reader = createHistoryReader({ after: '0', fetchPage: () => pending.promise, onPage() { applied = true; } });
  const reading = reader(controller.signal);
  controller.abort();
  pending.resolve({ data: [{ id: '1' }], meta: { nextAfter: '1', hasMore: false } });
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(applied, false);
});

test('empty history retains its cursor and invalid progress fails instead of looping', async () => {
  let calls = 0;
  const reader = createHistoryReader({ after: '5', onPage() {}, async fetchPage(cursor) {
    assert.equal(cursor, '5');
    return { data: [], meta: { nextAfter: '5', hasMore: calls++ > 0 } };
  } });
  const signal = new AbortController().signal;
  assert.equal(await reader(signal), false);
  await assert.rejects(reader(signal), /invalid message cursor/);
});
