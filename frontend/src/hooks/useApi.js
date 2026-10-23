// Loads API data with cancellation and guards against state updates after unmount.
import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data whenever dependencies change and exposes an explicit retry function.
 * @param {(signal: AbortSignal) => Promise<{data: *, meta?: object}>} fetchFn API loader.
 * @param {Array<*>} deps Dependency values that trigger a reload.
 * @returns {{data: *, meta: object|null, error: Error|null, isLoading: boolean, reload: () => void}}
 */
export default function useApi(fetchFn, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, error: null, isLoading: true });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, error: null, isLoading: true }));
    fetchFn(controller.signal)
      .then((result) => {
        if (active) setState({ data: result.data, meta: result.meta || null, error: null, isLoading: false });
      })
      .catch((error) => {
        if (active && error?.name !== 'AbortError') setState((previous) => ({ ...previous, error, isLoading: false }));
      });
    return () => {
      active = false;
      controller.abort();
    };
    // fetchFn is intentionally keyed by the caller-provided dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);

  return { ...state, reload };
}
