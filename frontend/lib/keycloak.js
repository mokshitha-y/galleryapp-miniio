'use client';

import Keycloak from 'keycloak-js';

const keycloakConfig = {
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080',
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'gallery',
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'gallery-app',
};

export function getKeycloak() {
  if (typeof window === 'undefined') return null;
  if (!window.__keycloak) {
    window.__keycloak = new Keycloak(keycloakConfig);
  }
  return window.__keycloak;
}

export function initKeycloak() {
  const keycloak = getKeycloak();
  if (!keycloak) return Promise.resolve(false);
  return keycloak.init({
    onLoad: 'check-sso',
    checkLoginIframe: false,
  });
}
