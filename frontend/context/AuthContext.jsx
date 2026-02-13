'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loginWithPassword,
  registerUser,
  refreshAccessToken,
  parseJwtPayload,
} from '@/lib/api';

const STORAGE_ACCESS = 'gallery_access_token';
const STORAGE_REFRESH = 'gallery_refresh_token';

function getStoredTokens() {
  if (typeof window === 'undefined') return { access: null, refresh: null };
  return {
    access: sessionStorage.getItem(STORAGE_ACCESS),
    refresh: sessionStorage.getItem(STORAGE_REFRESH),
  };
}

function setStoredTokens(access, refresh) {
  if (typeof window === 'undefined') return;
  if (access) sessionStorage.setItem(STORAGE_ACCESS, access);
  else sessionStorage.removeItem(STORAGE_ACCESS);
  if (refresh) sessionStorage.setItem(STORAGE_REFRESH, refresh);
  else sessionStorage.removeItem(STORAGE_REFRESH);
}

function clearStoredTokens() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
}

function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 < Date.now() + 60 * 1000;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);

  const user = accessToken
    ? (() => {
        const p = parseJwtPayload(accessToken);
        return p
          ? { username: p.preferred_username || p.sub, userId: p.sub }
          : null;
      })()
    : null;
  const authenticated = !!accessToken && !isTokenExpired(accessToken);

  const setTokens = useCallback((access, refresh) => {
    setAccessToken(access);
    setRefreshToken(refresh);
    setStoredTokens(access, refresh);
  }, []);

  const tryRefresh = useCallback(async () => {
    const { refresh } = getStoredTokens();
    if (!refresh) return false;
    try {
      const data = await refreshAccessToken(refresh);
      setTokens(data.access_token, data.refresh_token ?? refresh);
      return true;
    } catch {
      clearStoredTokens();
      setAccessToken(null);
      setRefreshToken(null);
      return false;
    }
  }, [setTokens]);

  useEffect(() => {
    const { access, refresh } = getStoredTokens();
    if (access && !isTokenExpired(access)) {
      setAccessToken(access);
      setRefreshToken(refresh);
      setReady(true);
      return;
    }
    if (refresh) {
      tryRefresh().finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [tryRefresh]);

  const login = useCallback(async (username, password) => {
    const data = await loginWithPassword(username, password);
    setTokens(data.access_token, data.refresh_token);
  }, [setTokens]);

  const register = useCallback(
    async (username, email, password, firstName, lastName) => {
      const data = await registerUser(username, email, password, firstName, lastName);
      if (data.access_token) setTokens(data.access_token, data.refresh_token);
    },
    [setTokens]
  );

  const logout = useCallback(() => {
    clearStoredTokens();
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  const getToken = useCallback(() => {
    if (accessToken && !isTokenExpired(accessToken)) return accessToken;
    return null;
  }, [accessToken]);

  const value = {
    ready,
    authenticated,
    user,
    login,
    register,
    logout,
    getToken,
    tryRefresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
