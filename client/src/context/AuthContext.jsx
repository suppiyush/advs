import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.js';

const AuthContext = createContext(null);

export const ROLE_HOME = {
  APPLICANT: '/applicant',
  VERIFIER: '/cases',
  ADMINISTRATOR: '/admin',
};

export const ROLE_LABEL = {
  APPLICANT: 'Applicant',
  VERIFIER: 'Admission Office Staff',
  ADMINISTRATOR: 'Administrator',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the httpOnly cookie on page load.
  useEffect(() => {
    authApi
      .fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const loggedIn = await authApi.login(email, password);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const register = useCallback(async (details) => {
    const registered = await authApi.register(details);
    setUser(registered);
    return registered;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
