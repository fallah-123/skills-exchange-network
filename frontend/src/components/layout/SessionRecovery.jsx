import { useEffect, useRef } from 'react';
import Button from '../ui/Button.jsx';
import './SessionRecovery.css';

export default function SessionRecovery({ checking, remaining, onRetry }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <main className="session-recovery" aria-labelledby="session-recovery-title">
    <section className="session-recovery__card" aria-busy={checking}>
      <h1 id="session-recovery-title" tabIndex={-1} ref={heading}>Check your session</h1>
      <p role="status">{checking ? 'Checking your session…' : "We couldn't check your session right now. Please try again shortly."}</p>
      {remaining > 0 && <p id="session-retry-delay">Please wait {remaining} seconds before retrying.</p>}
      <Button onClick={onRetry} disabled={checking || remaining > 0}
        aria-describedby={remaining > 0 ? 'session-retry-delay' : undefined}>Retry</Button>
    </section>
  </main>;
}
