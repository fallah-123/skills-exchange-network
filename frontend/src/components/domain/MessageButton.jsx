import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openConversation } from '../../api/messaging.api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../ui/Button.jsx';

export default function MessageButton({ requestId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const active = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => () => active.current?.abort(), []);

  async function open() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await openConversation(requestId, user.id, controller.signal);
      if (!controller.signal.aborted) navigate(`/messages/${result.data.id}`);
    } catch (failure) {
      if (failure.name !== 'AbortError') setError(failure);
    } finally {
      if (!controller.signal.aborted) { active.current = null; setBusy(false); }
    }
  }

  return <div>
    <Button onClick={open} disabled={busy}>{busy ? 'Opening…' : 'Message'}</Button>
    {error && <p role="alert">{error.message}</p>}
  </div>;
}
