import { useCallback, useEffect, useRef, useState } from 'react';

// A deadline (not a request timer): expiration never sends a request automatically.
export default function useRetryCooldown() {
  const deadline = useRef(0);
  const [remaining, setRemaining] = useState(0);
  const start = useCallback((seconds) => {
    const delay = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    deadline.current = Date.now() + delay * 1000;
    setRemaining(Math.ceil(delay));
  }, []);
  const blocked = useCallback(() => Date.now() < deadline.current, []);
  useEffect(() => {
    if (!remaining) return;
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [remaining > 0]);
  return { remaining, start, blocked };
}
