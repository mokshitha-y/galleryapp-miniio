import { Router } from 'express';

const router = Router();
const KEYCLOAK_URL = (process.env.KEYCLOAK_URL || 'http://localhost:8080').replace(/\/$/, '');
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'gallery';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'gallery-app';
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN || 'admin';
const KEYCLOAK_ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

async function keycloakTokenRequest(body) {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Authentication failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function getAdminToken() {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KEYCLOAK_ADMIN_USER,
        password: KEYCLOAK_ADMIN_PASS,
      }).toString(),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || 'Admin auth failed');
  return data.access_token;
}

/** POST /api/auth/login – your UI sends username + password, Keycloak used in background */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const data = await keycloakTokenRequest({
      grant_type: 'password',
      client_id: KEYCLOAK_CLIENT_ID,
      username: String(username).trim(),
      password: String(password),
    });
    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
  } catch (err) {
    const status = err.status || 401;
    res.status(status).json({ error: err.message || 'Login failed' });
  }
});

/** POST /api/auth/register – creates user in Keycloak with email verification; redirect to login (no tokens) */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const emailTrimmed = email ? String(email).trim() : '';
    if (!emailTrimmed) {
      return res.status(400).json({ error: 'Email is required for account verification.' });
    }
    const un = String(username).trim();
    const fn = firstName != null ? String(firstName).trim() : un;
    const ln = lastName != null ? String(lastName).trim() : '';
    const adminToken = await getAdminToken();
    const createRes = await fetch(
      `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: un,
          firstName: fn || un,
          lastName: ln,
          email: emailTrimmed,
          emailVerified: false,
          enabled: true,
          requiredActions: ['VERIFY_EMAIL'],
          credentials: [{ type: 'password', value: String(password), temporary: false }],
        }),
      }
    );
    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      if (createRes.status === 409) {
        return res.status(409).json({ error: 'Username already exists' });
      }
      return res.status(createRes.status).json({ error: errData.errorMessage || errData.error || 'Registration failed' });
    }
    const location = createRes.headers.get('Location');
    const userId = location ? location.split('/').pop() : null;
    if (userId) {
      const executeRes = await fetch(
        `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/execute-actions-email`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(['VERIFY_EMAIL']),
        }
      );
      if (!executeRes.ok) {
        console.error('Keycloak execute-actions-email failed:', executeRes.status, await executeRes.text());
      }
    }
    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account, then log in.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

/** POST /api/auth/refresh */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    const data = await keycloakTokenRequest({
      grant_type: 'refresh_token',
      client_id: KEYCLOAK_CLIENT_ID,
      refresh_token: String(refresh_token),
    });
    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_in: data.expires_in,
    });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Refresh failed' });
  }
});

export default router;
