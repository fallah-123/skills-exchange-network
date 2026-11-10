import { useCallback, useEffect, useRef, useState } from 'react';
import { listConversations } from '../api/messaging.api.js';
import { bindPollingLifecycle, createPollingTask } from '../utils/polling.js';

export default function useConversationInbox(page, userId) {
  const scope = `${userId}:${page}`;
  const [state, setState] = useState({ scope, data: null, meta: null, error: null, status: { phase: 'connecting' } });
  const polling = useRef(null);
  useEffect(() => {
    setState({ scope, data: null, meta: null, error: null, status: { phase: 'connecting' } });
    const task = createPollingTask({
      intervalMs: 10000,
      async run(signal) {
        const result = await listConversations(page, signal);
        signal.throwIfAborted();
        setState((previous) => ({ ...previous, data: result.data, meta: result.meta, error: null }));
      },
      onStatus(status) {
        setState((previous) => ({ ...previous, status,
          ...(status.error ? { error: status.error } : {}),
          ...([401, 403].includes(status.error?.status) ? { data: null, meta: null } : {}),
        }));
      },
    });
    polling.current = task;
    const unbind = bindPollingLifecycle(task);
    task.refresh();
    return unbind;
  }, [page, userId, scope]);
  const reload = useCallback(() => polling.current?.refresh(), []);
  const current = state.scope === scope ? state : { data: null, meta: null, error: null, status: { phase: 'connecting' } };
  return { ...current, isLoading: current.data === null && !current.error, reload };
}
