// Initializes auth state from the server session and exposes login/logout actions.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, loginUser, logoutUser } from '../api/auth.api.js';
import { setUnauthenticatedHandler } from '../api/client.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

/** Provides server-session authentication state to route and page components. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
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
      setUser(null);
      showToast({ type: 'error', message: 'Please log in to continue.' });
      navigate('/login', { replace: true, state: { sessionExpired: true } });
      return error;
    });
    return () => setUnauthenticatedHandler(null);
  }, [navigate, showToast]);

  const login = useCallback(async (credentials) => {
    const result = await loginUser(credentials);
    setUser(result.data);
    return result;
  }, []);
  const logout = useCallback(async () => {
    const result = await logoutUser();
    setUser(null);
    return result;
  }, []);
  const value = useMemo(() => ({ user, isLoading, login, logout, setUser }), [user, isLoading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads authentication state and actions from the nearest provider. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
