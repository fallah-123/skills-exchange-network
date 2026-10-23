// Delays rapidly changing input values until the user pauses.
import { useEffect, useState } from 'react';

/** Returns a value after it has remained unchanged for the requested delay. */
export default function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}
