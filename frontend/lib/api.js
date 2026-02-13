const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getAuthHeadersAsync(getToken, tryRefresh) {
  let token = getToken?.();
  if (!token && tryRefresh) {
    await tryRefresh();
    token = getToken?.();
  }
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function parseJwtPayload(token) {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export async function loginWithPassword(username, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function registerUser(username, email, password, firstName, lastName) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: username.trim(),
      email: email ? email.trim() : undefined,
      password,
      firstName: firstName != null ? String(firstName).trim() : undefined,
      lastName: lastName != null ? String(lastName).trim() : undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Refresh failed');
  return data;
}

export { parseJwtPayload };

export async function fetchFiles(getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files`, { headers });
  if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to fetch files');
  return res.json();
}

export async function fetchTrash(getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/trash`, { headers });
  if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to fetch trash');
  return res.json();
}

export async function getPresignedUploadUrl(keyOrName, getToken, tryRefresh, expiresIn = 900) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/presigned-upload-url`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: keyOrName, expiresIn }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to get upload link');
  }
  return res.json();
}

export async function uploadFiles(files, getToken, tryRefresh) {
  const uploaded = [];
  for (const file of files) {
    const { url, key } = await getPresignedUploadUrl(file.name, getToken, tryRefresh);
    const putRes = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed for ${file.name}`);
    }
    uploaded.push({ key, name: file.name });
  }
  return { uploaded };
}

export async function getPresignedUrl(key, getToken, tryRefresh, expiresIn = 3600, disposition) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const params = new URLSearchParams({ expiresIn: String(expiresIn) });
  if (disposition === 'attachment') params.set('disposition', 'attachment');
  const res = await fetch(
    `${API_URL}/api/files/presigned-url/${encodeURIComponent(key)}?${params}`,
    { headers }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to get link');
  }
  const data = await res.json();
  return data.url;
}

export async function downloadFile(key, getToken, tryRefresh) {
  const url = await getPresignedUrl(key, getToken, tryRefresh, 3600, 'attachment');
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  a.download = key.replace(/^trash\//, '').split('/').pop() || 'download';
  a.click();
}

export async function softDeleteFile(key, getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/trash/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to move to recycle bin');
  }
}

export async function hardDeleteFile(key, getToken, fromTrash = false, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const path = fromTrash
    ? `${API_URL}/api/files/trash/${encodeURIComponent(key)}`
    : `${API_URL}/api/files/${encodeURIComponent(key)}?permanent=true`;
  const res = await fetch(path, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete permanently');
  }
}

export async function restoreFile(key, getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/restore/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to restore');
  }
}

/** Get bucket access: public (anyone can read) or private. */
export async function getBucketAccess(getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/bucket-access`, { headers });
  if (!res.ok) throw new Error('Failed to get bucket access');
  return res.json();
}

/** Set bucket access: public true | false. */
export async function setBucketAccess(isPublic, getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/bucket-access`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ public: isPublic }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to set bucket access');
  }
  return res.json();
}

/** Set per-file visibility (object ACL): public true | false. */
export async function setFileVisibility(key, isPublic, getToken, tryRefresh) {
  const headers = await getAuthHeadersAsync(getToken, tryRefresh);
  const res = await fetch(`${API_URL}/api/files/${encodeURIComponent(key)}/visibility`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ public: isPublic }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update visibility');
  }
  return res.json();
}
