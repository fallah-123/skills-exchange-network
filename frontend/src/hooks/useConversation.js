import { useCallback, useEffect, useRef, useState } from 'react';
import { getConversation, listMessages, sendMessage } from '../api/messaging.api.js';
import { mergeMessages } from '../utils/messaging.js';
import { bindPollingLifecycle, createHistoryReader, createPollingTask } from '../utils/polling.js';

const empty = { loading: true, conversation: null, messages: [], before: null, error: null };

export default function useConversation(id, userId, onSent) {
  const [state, setState] = useState(empty);
  const [revision, setRevision] = useState(0);
  const [working, setWorking] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pollStatus, setPollStatus] = useState({ phase: 'connecting' });
  const runtime = useRef(null);
  const changed = useRef(onSent);
  changed.current = onSent;
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const lifetime = new AbortController();
    const current = { lifetime, reader: null, before: null, older: false, sending: false, refreshing: false };
    runtime.current = current;
    setWorking(null);
    setActionError(null);
    setPollStatus({ phase: 'connecting' });
    setState(empty);
    current.failAccess = (error) => {
      if (![401, 403, 404].includes(error.status)) return false;
      current.poller.stop();
      lifetime.abort();
      setState({ ...empty, loading: false, error });
      return true;
    };
    current.poller = createPollingTask({
      intervalMs: 3000,
      async run(signal) {
        if (!current.reader) {
          const [conversation, history] = await Promise.all([getConversation(id, signal), listMessages(id, {}, signal)]);
          signal.throwIfAborted();
          current.before = history.meta.nextBefore;
          setState({ loading: false, conversation: conversation.data, messages: history.data, before: current.before, error: null });
          current.reader = createHistoryReader({
            after: history.meta.nextAfter,
            fetchPage: (after, readSignal) => listMessages(id, { after }, readSignal),
            onPage(result) {
              if (result.data.length) {
                setState((previous) => ({ ...previous, messages: mergeMessages(previous.messages, result.data) }));
              }
            },
          });
          return false;
        }
        return current.reader(signal);
      },
      onStatus(status) {
        if (lifetime.signal.aborted) return;
        setPollStatus(status);
        if (status.phase === 'error' && !current.failAccess(status.error) && !current.reader) {
          setState({ ...empty, loading: false, error: status.error });
        }
      },
    });
    const unbind = bindPollingLifecycle(current.poller);
    // Opening a conversation is an explicit load, even if an embedded preview
    // reports itself hidden until focused. Visibility pauses background work only.
    current.poller.refresh();
    return () => { lifetime.abort(); unbind(); };
  }, [id, userId, revision]);

  async function refresh() {
    const current = runtime.current;
    if (current.lifetime.signal.aborted || current.refreshing || current.older) return;
    current.refreshing = true;
    setWorking('refresh');
    try { await current.poller.refresh(); }
    finally {
      if (!current.lifetime.signal.aborted) { current.refreshing = false; setWorking(null); }
    }
  }

  async function loadOlder(beforeMerge) {
    const current = runtime.current;
    if (current.lifetime.signal.aborted || current.older || current.refreshing || !current.before) return;
    current.older = true;
    setWorking('older');
    setActionError(null);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    current.lifetime.signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 15000);
    try {
      const result = await listMessages(id, { before: current.before }, controller.signal);
      controller.signal.throwIfAborted();
      current.before = result.meta.nextBefore;
      if (result.data.length) beforeMerge?.();
      setState((previous) => ({ ...previous, messages: mergeMessages(previous.messages, result.data), before: current.before }));
    } catch (error) {
      if (!current.lifetime.signal.aborted && !current.failAccess(error)) {
        setActionError(error.name === 'AbortError' ? new Error('Loading older messages timed out. Try again.') : error);
      }
    } finally {
      clearTimeout(timeout);
      current.lifetime.signal.removeEventListener('abort', cancel);
      if (!current.lifetime.signal.aborted) { current.older = false; setWorking(null); }
    }
  }

  async function send(fields) {
    const current = runtime.current;
    const { signal } = current.lifetime;
    signal.throwIfAborted();
    if (current.sending) throw new Error('A message is already being sent.');
    current.sending = true;
    try {
      const result = await sendMessage(id, fields, userId, signal);
      signal.throwIfAborted();
      setState((previous) => ({ ...previous, messages: mergeMessages(previous.messages, [result.data]) }));
      changed.current();
      return result.data;
    } catch (error) {
      if (!signal.aborted) current.failAccess(error);
      throw error;
    } finally {
      if (!signal.aborted) current.sending = false;
    }
  }

  return { ...state, working, actionError, pollStatus, reload, refresh, loadOlder, send };
}
