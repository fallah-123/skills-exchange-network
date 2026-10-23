// Provides transient, dismissible success and error messages across the app.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { TOAST_DURATION_MS } from '../constants.js';

const ToastContext = createContext(null);

/** Provides the toast queue to child components. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismissToast = useCallback((id) => setToasts((items) => items.filter((toast) => toast.id !== id)), []);
  const showToast = useCallback(({ type = 'success', message }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { id, type, message }]);
    window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
  }, [dismissToast]);
  const value = useMemo(() => ({ showToast, dismissToast, toasts }), [showToast, dismissToast, toasts]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** Reads toast actions and state from the nearest provider. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
}
