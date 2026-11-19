import {resetVerificationSession} from '../api/verification.api.js';
// Initializes auth state from the server session and exposes login/logout actions.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useRetryCooldown from '../hooks/useRetryCooldown.js';
import SessionRecovery from '../components/layout/SessionRecovery.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, loginUser, logoutUser } from '../api/auth.api.js';
import { setUnauthenticatedHandler } from '../api/client.js';
import { resetMessagingSession } from '../api/messaging.api.js';
import { resetNotificationsSession } from '../api/notifications.api.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

/** Provides server-session authentication state to route and page components. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const sessionRequest = useRef(null);
  const { remaining, start: startCooldown, blocked } = useRetryCooldown();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const checkSession = useCallback(async () => {
    if (sessionRequest.current || blocked()) return;
    const controller = new AbortController();
    sessionRequest.current = controller;
    setIsLoading(true);
    // A stalled connection must also reach the explicit recovery state.
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await getCurrentUser({ signal: controller.signal });
      if (sessionRequest.current !== controller) return;
      setUser(result.data);
      setSessionUnavailable(false);
      startCooldown(0);
    } catch (error) {
      if (sessionRequest.current !== controller) return;
      if (error.status === 401) {
        setUser(null);
        setSessionUnavailable(false);
        startCooldown(0);
      } else {
        // Unknown authentication is neither authenticated nor confirmed logout.
        setSessionUnavailable(true);
        startCooldown(error.retryAfter);
      }
    } finally {
      clearTimeout(timeout);
      if (sessionRequest.current === controller) {
        sessionRequest.current = null;
        setIsLoading(false);
      }
    }
  }, [blocked, startCooldown]);

  useEffect(() => {
    checkSession();
    return () => {
      const pending = sessionRequest.current;
      sessionRequest.current = null;
      pending?.abort();
    };
  }, [checkSession]);

  useEffect(() => {
    setUnauthenticatedHandler((error) => {
      resetVerificationSession();
      resetMessagingSession();
      resetNotificationsSession();
      setUser(null);
      showToast({ type: 'error', message: 'Please log in to continue.' });
      navigate('/login', { replace: true, state: { sessionExpired: true } });
      return error;
    });
    return () => setUnauthenticatedHandler(null);
  }, [navigate, showToast]);

  const login = useCallback(async (credentials) => {
    resetVerificationSession();
    resetMessagingSession();
    resetNotificationsSession();
    setIsTransitioning(true);
    try {
      const result = await loginUser(credentials);
      setUser(result.data);
      return result;
    } finally { setIsTransitioning(false); }
  }, []);
  const logout = useCallback(async () => {
    resetVerificationSession();
    resetMessagingSession();
    resetNotificationsSession();
    setIsTransitioning(true);
    try {
      const result = await logoutUser();
      setUser(null);
      return result;
    } finally { setIsTransitioning(false); }
  }, []);
  const value = useMemo(() => ({ user, isLoading, isTransitioning, login, logout, setUser }), [user, isLoading, isTransitioning, login, logout]);
  return <AuthContext.Provider value={value}>
    {sessionUnavailable
      ? <SessionRecovery checking={isLoading} remaining={remaining} onRetry={checkSession} />
      : isLoading ? <LoadingBlock label="Checking your session" /> : children}
  </AuthContext.Provider>;
}

/** Reads authentication state and actions from the nearest provider. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
