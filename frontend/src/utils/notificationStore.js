import { createPollingTask, bindPollingLifecycle } from './polling.js';

export const emptyNotifications = () => ({ items: [], unreadCount: null, loaded: false, open: false,
  nextCursor: null, error: null, actionError: null, busy: false, confirmClearAll: false, status: { phase: 'connecting' } });

// A single owner shared by the header and all routes. Kept independent of React
// so lifecycle, mutation/read races, and account isolation can be tested directly.
export function createNotificationStore({ userId, api, onChange, environment, clock }) {
  let state = emptyNotifications();
  let stopped = false;
  let terminal = false;
  let readController;
  let readFlight;
  let actionController;
  let unbind;
  let lastFetchOpen;
  const emit = patch => { if (!stopped) { state = { ...state, ...patch }; onChange(state); } };
  function accessFailure(error) {
    if (error.status === 401 || error.code === 'SESSION_CHANGED') {
      terminal = true;
      poller.stop();
      emit({ ...emptyNotifications(), open: state.open, error, status: { phase: 'error', error } });
      return true;
    }
    return false;
  }
  const poller = createPollingTask({ intervalMs: 30000, maxRetryMs: 120000, clock,
    async run(signal) {
      if (state.busy || terminal) return;
      const controller = new AbortController();
      readController = controller;
      const cancel = () => controller.abort();
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      const open = state.open;
      readFlight = (async () => {
        try {
          const result = open ? await api.list(userId, undefined, controller.signal) : await api.count(userId, controller.signal);
          controller.signal.throwIfAborted();
          lastFetchOpen = open;
          emit(open ? { items: result.data, nextCursor: result.meta.nextCursor, unreadCount: result.meta.unreadCount, loaded: true, error: null }
            : { unreadCount: result.data.unreadCount, error: null });
        } catch (error) { if (!controller.signal.aborted) accessFailure(error); throw error; }
        finally { signal.removeEventListener('abort', cancel); }
      })();
      try { await readFlight; }
      catch (error) { if (!controller.signal.aborted || signal.aborted) throw error; }
      finally { if (readController === controller) { readController = null; readFlight = null; } }
    },
    onStatus(status) { if (!terminal) emit({ status, ...(status.error ? { error: status.error } : {}) }); },
  });

  function visible() { return !environment || (environment.document.visibilityState !== 'hidden' && environment.navigator.onLine !== false); }
  async function action(operation, apply) {
    if (stopped || terminal || state.busy) return;
    emit({ busy: true, actionError: null });
    readController?.abort();
    await readFlight?.catch(() => {});
    if (stopped) return;
    const controller = new AbortController();
    actionController = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await operation(controller.signal);
      controller.signal.throwIfAborted();
      if (!stopped) apply(result);
    } catch (error) {
      if (!stopped && !accessFailure(error)) emit({ actionError: error.name === 'AbortError' ? new Error('The request timed out. Refresh and try again.') : error });
    } finally {
      clearTimeout(timer);
      if (actionController === controller) actionController = null;
      emit({ busy: false });
    }
  }

  async function clear(operation) {
    await action(operation, result => {
      const removed = new Set(result.data.clearedIds);
      emit({ items: state.items.filter(item => !removed.has(item.id)), unreadCount: result.meta.unreadCount });
    });
    // Never blank the whole list optimistically: concurrent new activity may survive.
    if (!stopped && !terminal && visible()) await poller.refresh();
  }

  return {
    start() { if (!stopped && !unbind) unbind = bindPollingLifecycle(poller, environment); },
    stop() { stopped = true; unbind?.(); poller.stop(); readController?.abort(); actionController?.abort(); },
    getState: () => state,
    async setOpen(open) {
      emit({ open, ...(!open ? { confirmClearAll: false } : {}) });
      if (open && !terminal && !state.busy) {
        readController?.abort();
        await readFlight?.catch(() => {});
        if (!stopped) {
          await poller.refresh();
          if (!stopped && !terminal && lastFetchOpen !== true) await poller.refresh();
        }
      }
    },
    refresh() { if (!terminal && !state.busy) { emit({ actionError: null }); return poller.refresh(); } },
    async loadMore() {
      const cursor = state.nextCursor;
      if (!cursor) return;
      await action(signal => api.list(userId, cursor, signal), result => {
        const seen = new Set(state.items.map(item => item.id));
        emit({ items: [...state.items, ...result.data.filter(item => !seen.has(item.id))], nextCursor: result.meta.nextCursor,
          unreadCount: result.meta.unreadCount, error: null });
      });
    },
    async markRead(item) {
      if (item.readAt) return;
      await action(signal => api.read(userId, item, signal), result => emit({
        items: state.items.map(row => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row), unreadCount: result.meta.unreadCount,
      }));
      if (!stopped && !terminal && visible()) await poller.refresh();
    },
    async markAllRead() {
      await action(signal => api.readAll(userId, signal), result => emit({ unreadCount: result.meta.unreadCount }));
      if (!stopped && !terminal && visible()) await poller.refresh();
    },
    clearOne(item) { return clear(signal => api.clear(userId, item, signal)); },
    clearRead() { return clear(signal => api.clearRead(userId, signal)); },
    requestClearAll() { if (!stopped && !terminal && !state.busy) emit({ confirmClearAll: true }); },
    cancelClearAll() { emit({ confirmClearAll: false }); },
    confirmClearAll() {
      if (!state.confirmClearAll || stopped || terminal || state.busy) return;
      emit({ confirmClearAll: false });
      return clear(signal => api.clearAll(userId, signal));
    },
  };
}
