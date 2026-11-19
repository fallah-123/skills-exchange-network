import {resetVerificationSession} from '../api/verification.api.js';
// Initializes auth state from the server session and exposes login/logout actions.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((result) => { if (active) setUser(result.data); })
      .catch((error) => {
        if (active && error.code !== 'UNAUTHENTICATED') showToast({ type: 'error', message: error.message });
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [showToast]);

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
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads authentication state and actions from the nearest provider. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
