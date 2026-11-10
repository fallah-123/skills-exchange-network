import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { messageLength, messageValidation } from '../../utils/messaging.js';

export default function MessageComposer({ onSend }) {
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [caretToRestore, setCaretToRestore] = useState(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const input = useRef(null);
  const length = messageLength(draft);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useLayoutEffect(() => {
    if (caretToRestore === null) return;
    input.current?.focus();
    input.current?.setSelectionRange(caretToRestore.position, caretToRestore.position);
  }, [caretToRestore]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) { setRetryAt(0); clearInterval(timer); }
    }, 250);
    return () => clearInterval(timer);
  }, [retryAt]);

  function insertEmoji(emoji) {
    if (busy || attempt || !input.current) return;
    const { selectionStart, selectionEnd } = input.current;
    const nextDraft = draft.slice(0, selectionStart) + emoji + draft.slice(selectionEnd);
    if (messageLength(nextDraft) > 2000) {
      setError({ message: 'Keep your message within 2,000 characters.' });
      setCaretToRestore({ position: selectionStart });
      return;
    }
    setDraft(nextDraft);
    setError(null);
    // Textarea offsets use UTF-16 units, while the message limit uses code points.
    setCaretToRestore({ position: selectionStart + emoji.length });
  }

  async function submit(event) {
    event?.preventDefault();
    if (locked.current || wait || error?.code === 'SESSION_CHANGED') return;
    const validation = messageValidation(draft);
    if (validation) { setError({ message: validation }); return; }
    const fields = attempt || { body: draft.trim(), clientMessageId: crypto.randomUUID() };
    locked.current = true;
    setAttempt(fields);
    setBusy(true);
    setError(null);
    try {
      await onSend(fields);
      if (!mounted.current) return;
      setDraft('');
      setAttempt(null);
      input.current?.focus();
    } catch (failure) {
      if (!mounted.current || failure.name === 'AbortError') return;
      setError(failure);
      if (failure.retryAfter) { setNow(Date.now()); setRetryAt(Date.now() + failure.retryAfter * 1000); }
      // Validation failures were rejected before storage; editing is safe.
      if (failure.status === 400 || failure.status === 413) setAttempt(null);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <form className="message-composer" onSubmit={submit}>
    <div className="message-composer__toolbar">
      <label htmlFor="message-body">Your message</label>
      <EmojiPicker disabled={busy || !!attempt} onSelect={insertEmoji} />
    </div>
    <textarea ref={input} id="message-body" rows={3} value={draft} readOnly={busy || !!attempt}
      placeholder="Share an idea or plan your next session…" aria-describedby="message-help message-count"
      aria-invalid={length > 2000 || undefined}
      onChange={(event) => { setDraft(event.target.value); setError(null); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) submit(event);
      }} />
    {error && <div className="message-error" role="alert">
      <p>{error.message}</p>
      {attempt && error.code !== 'SESSION_CHANGED' && <p>Delivery is not confirmed. Retry safely with the same message.</p>}
      {error.code === 'SESSION_CHANGED' && <Button variant="secondary" onClick={() => window.location.reload()}>Reload page</Button>}
    </div>}
    <div className="message-composer__footer">
      <div><small id="message-help">Ctrl / ⌘ + Enter to send</small><small id="message-count" className={length > 2000 ? 'message-error' : ''}>{length.toLocaleString()} / 2,000</small></div>
      <Button type="submit" disabled={busy || !length || length > 2000 || wait > 0 || error?.code === 'SESSION_CHANGED'}>
        {busy ? 'Sending…' : wait ? `Retry in ${wait}s` : attempt ? 'Retry send' : 'Send message'}
      </Button>
    </div>
    {attempt && error && error.code !== 'SESSION_CHANGED' && <div className="message-composer__discard">
      <small>Clearing the draft does not undo a message that may already have arrived.</small>
      <Button variant="secondary" disabled={busy} onClick={() => { setAttempt(null); setDraft(''); setError(null); input.current?.focus(); }}>Clear draft</Button>
    </div>}
    <span className="sr-only" role="status">{busy ? 'Sending message' : ''}</span>
  </form>;
}
