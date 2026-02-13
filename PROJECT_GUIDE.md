# Gallery App – Project Guide

This document explains the **whole process**, **all APIs**, **data flow**, and **must-know** details for the Gallery application (Keycloak + MinIO).

---

## 1. Overview

- **What it is:** A gallery app where users sign up, verify their email, log in, and manage files (upload, view, download, soft delete, restore, hard delete) in their own storage.
- **Auth:** Keycloak (users and tokens). The app uses **custom Login/Sign up pages**; Keycloak is never shown in the UI. Backend talks to Keycloak via Admin API and token endpoint.
- **Storage:** MinIO (S3-compatible). **One bucket per user** (`gallery-{username}`). Recycle bin is implemented as a `trash/` prefix inside the same bucket.
- **Stack:** Next.js 14 (App Router) frontend, Express backend, Keycloak, MinIO.

---

## 2. High-Level Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Next.js   │────▶│   Express   │────▶│  Keycloak   │
│  (React)    │     │  Frontend   │     │   Backend   │     │   (auth)    │
└─────────────┘     └─────────────┘     └──────┬──────┘     └─────────────┘
       │                     │                 │
       │                     │                 └────────────▶┌─────────────┐
       │                     │                               │   MinIO     │
       │                     │                               │  (storage)  │
       │                     │                               └─────────────┘
```

- **Sign up:** User submits form → Backend creates user in Keycloak (Admin API), triggers verification email (Execute actions email), returns success → Frontend redirects to Login with “check your email” message. **No tokens** returned on register.
- **Log in:** User submits username/password → Backend exchanges them for Keycloak tokens (password grant) → Frontend stores access + refresh tokens (e.g. sessionStorage) and redirects to Gallery.
- **Gallery:** All file API calls send `Authorization: Bearer <access_token>`. Backend verifies JWT with Keycloak’s JWKS, resolves user → uses that user’s MinIO bucket for all file operations.

---

## 3. Backend API Reference

Base URL: `http://localhost:4000` (or your `PORT`).

### 3.1 Health

| Method | Path       | Auth | Description        |
|--------|------------|------|--------------------|
| GET    | `/health`  | No   | Health check       |

**Response:** `{ "status": "ok" }`

---

### 3.2 Auth APIs (`/api/auth/*`)

All auth endpoints use **JSON** request body and return **JSON**.

#### POST `/api/auth/login`

- **Body:** `{ "username": string, "password": string }`
- **Success (200):** `{ "access_token", "refresh_token", "expires_in" }`
- **Error (400/401):** `{ "error": string }`
- **Flow:** Backend calls Keycloak token endpoint with `grant_type=password`. If the user has not verified email, Keycloak may reject login (depends on realm settings).

#### POST `/api/auth/register`

- **Body:** `{ "username", "email", "password", "firstName?", "lastName?" }`  
  - `username`, `email`, `password` required. `firstName`/`lastName` optional (fallback to username / empty).
- **Success (201):** `{ "message": "Registration successful. Please check your email to verify your account, then log in." }`  
  - **No tokens** in response; user must verify email and then log in.
- **Errors:**
  - 400: missing username/password or email
  - 409: username already exists
  - 500: server/Keycloak error
- **Backend flow:**  
  1. Create user in Keycloak (Admin API) with `emailVerified: false`, `requiredActions: ["VERIFY_EMAIL"]`, password `temporary: false`.  
  2. Read user id from `Location` header.  
  3. Call Keycloak **Execute actions email** `PUT .../users/{userId}/execute-actions-email` with body `["VERIFY_EMAIL"]` so Keycloak sends the verification email.  
  4. Return 201 with message only.

#### POST `/api/auth/refresh`

- **Body:** `{ "refresh_token": string }`
- **Success (200):** `{ "access_token", "refresh_token", "expires_in" }`
- **Error (400/401):** `{ "error": string }`
- **Flow:** Backend exchanges refresh_token with Keycloak token endpoint (`grant_type=refresh_token`).

---

### 3.3 File APIs (`/api/files/*`)

**All file endpoints require authentication:**  
`Authorization: Bearer <access_token>`

User is inferred from the JWT (`preferred_username` or `sub`). Each user has one bucket: `gallery-{sanitized-username}`. Trash is stored under the `trash/` prefix in the same bucket.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/files` | List user’s files (excludes trash) |
| GET | `/api/files/trash` | List trashed files |
| POST | `/api/files/upload` | Upload via backend (multipart); app uses presigned PUT instead (see below) |
| POST | `/api/files/presigned-upload-url` | Get presigned PUT URL for one file; body `{ "key": "filename.pdf" }` → `{ url, key, expiresIn }` |
| GET | `/api/files/download/:key` | Download file; `?disposition=inline` for view in browser |
| POST | `/api/files/trash/:key` | Soft delete: move file to recycle bin |
| POST | `/api/files/restore/:key` | Restore from trash (key must be trash/… or just filename in trash) |
| DELETE | `/api/files/trash/:key` | Hard delete from recycle bin (permanent) |
| DELETE | `/api/files/:key` | Delete from main list: no query = soft delete; `?permanent=true` = hard delete |
| GET | `/api/files/presigned-url/:key` | Get temporary URL for view/download; `?expiresIn=3600` (seconds, 60–604800) |
| GET | `/api/files/bucket-access` | Get whether bucket is public or private |
| PATCH | `/api/files/bucket-access` | Set bucket public or private; body `{ "public": true \| false }` |
| PATCH | `/api/files/:key/visibility` | Set per-file public or private (object ACL); body `{ "public": true \| false }` |

**Details:**

- **List (GET /api/files, GET /api/files/trash)**  
  - Main list: `{ "files": [ { "key", "size", "lastModified", "isPublic" } ] }`. `isPublic` is **per-file** (object ACL: public-read vs private). When bucket is public, only files with `isPublic: true` are anonymously readable; when bucket is private, no anonymous access regardless.  
  - Trash list: same shape (no visibility for trashed files).

- **Upload (presigned PUT)**  
  - Frontend gets a presigned PUT URL per file via `POST /api/files/presigned-upload-url` with `{ "key": "<filename>" }` (key is sanitized by backend).  
  - Frontend then `PUT`s the file to the returned `url` with `Content-Type: <file.type>`.  
  - Response from presigned-upload-url: `{ "url", "key", "expiresIn" }`. After PUT, the file appears in the list.  
  - If the browser’s PUT to MinIO fails (e.g. CORS), configure MinIO to allow your frontend origin and method PUT.

- **Presigned URL (GET /api/files/presigned-url/:key)**  
  - Returns `{ "url", "expiresIn" }`. The URL allows anyone to GET the object until it expires (no auth header). Use for view/download to avoid proxying through the backend.

- **Download (GET /api/files/download/:key)**  
  - `key` is URL-encoded.  
  - Query `disposition=inline` → view in browser; otherwise attachment.  
  - Response: file stream (binary).

- **Key format:** Main list keys are filenames at root (e.g. `photo.jpg`). Trash keys are `trash/filename`. Restore expects key in trash form. **Access:** Bucket can be **public** or **private**; each file can be **public** or **private** (object ACL). When bucket is public, only files marked public are anonymously readable (see § 7.1).

---

## 4. Frontend Flow (Summary)

- **Auth:** `AuthContext` holds access/refresh tokens (e.g. sessionStorage). It exposes `login`, `register`, `logout`, `getToken`, `tryRefresh`.  
- **Register:** Calls `POST /api/auth/register`. On success, does **not** store tokens; redirects to `/login?message=check-email`. Login page shows “Check your email to verify your account, then log in.”  
- **Login:** Calls `POST /api/auth/login`, stores tokens, redirects to `/gallery`.  
- **Gallery:** All file operations use `getToken()` in `Authorization` header. List files, upload, view (inline URL), download, move to trash, restore, delete permanently.  
- **Token refresh:** When access token is expired, frontend can call `POST /api/auth/refresh` with refresh_token and replace stored tokens (e.g. in `tryRefresh`).

---

## 5. Environment Variables

### Backend (`backend/.env`)

| Variable | Purpose | Example |
|----------|---------|--------|
| `KEYCLOAK_URL` | Keycloak base URL | `http://localhost:8080` |
| `KEYCLOAK_REALM` | Realm name | `gallery` |
| `KEYCLOAK_CLIENT_ID` | Client for token/refresh | `gallery-app` |
| `KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN` | Admin user for Admin API | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin password | `admin` |
| `MINIO_ENDPOINT` | MinIO S3 API URL (port 9000) | `http://localhost:9000` |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin` |
| `MINIO_BUCKET` | Default bucket name (per-user buckets still use `gallery-{username}`) | `gallery` |
| `PORT` | Backend port | `4000` |
| `FRONTEND_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |

MinIO: **9000** = S3 API (backend), **9001** = Web Console (browser). Changing access/secret keys requires a backend restart.

### Frontend (`frontend/.env.local`)

| Variable | Purpose | Example |
|----------|--------|--------|
| `NEXT_PUBLIC_API_URL` | Backend base URL for API calls | `http://localhost:4000` |
| `NEXT_PUBLIC_KEYCLOAK_*` | Optional; used if frontend ever talks to Keycloak directly | Same as backend |

---

## 6. Keycloak Setup (Must-Know)

- **Realm:** Use realm `gallery` (or match `KEYCLOAK_REALM`).  
- **Client:** Client id `gallery-app` (or match `KEYCLOAK_CLIENT_ID`). Enable **Direct access grants** (Resource owner password credentials) so the backend can use password and refresh_token grants.  
- **Email verification:**  
  - In Keycloak Admin → Realm → **Realm settings** → **Email**, configure **SMTP** (host, port, from, auth).  
  - “Test connection” sends to the **sender** address.  
  - Verification emails to **users** are sent only when the backend calls **Execute actions email** with `VERIFY_EMAIL` after user creation (already implemented).  
- **Users:** Created via Admin API on sign up. Password is set on signup form only; no “update password” required action.  
- **Admin credentials:** Must match `KEYCLOAK_ADMIN_USERNAME` and `KEYCLOAK_ADMIN_PASSWORD` in backend `.env` for Admin API and execute-actions-email to work.

---

## 7. MinIO (Must-Know)

- **Buckets:** One per user: `gallery-{sanitized-username}` (e.g. `gallery-john-doe`). Created on first use (list/upload).  
- **Trash:** Objects under prefix `trash/` in the same bucket. Soft delete = copy to `trash/{key}` then delete original; restore = copy from trash back to root and delete trash copy.  
- **Credentials:** Backend uses `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`. Rotating keys: update `.env` and restart backend.  
- **Docker:** If using `docker-compose`, MinIO often exposes 9000 (API) and 9001 (Console). Backend must use the API endpoint (9000).

**Bucket and per-file access:** Users set **bucket** public/private and each **file** public/private (see **7.1**). Presigned URLs work for view/download in the app (see **7.2**). **Note:** Per-file visibility uses object ACLs; some MinIO deployments disable ACLs—if you see “functionality not implemented”, enable ACLs in MinIO or use bucket-only mode.

---

## 7.1 Bucket and per-file public / private

**Bucket level**

- **Public:** Backend sets bucket policy: **Deny** `trash/*`, **Allow** `s3:GetObject` on `<bucket>/*`. Anonymous reads are allowed only for objects whose **object ACL** is `public-read`.
- **Private:** Backend removes the bucket policy. No anonymous access (regardless of per-file ACL).

**Per-file level (object ACL)**

- Each file has an ACL: **public-read** (anonymous can read when bucket allows) or **private** (only owner / presigned).
- **Make public** sets the object’s ACL to `public-read`. **Make private** sets it to `private`.
- When **bucket is public**: only files marked Public are anonymously readable. Files marked Private require the owner or a presigned URL.
- When **bucket is private**: no anonymous access; per-file Public/Private only affects behavior after you set the bucket to public. Users can mark files Public while the bucket is private (good UX: they’re ready when the bucket is set to Public); access is enforced accordingly—anonymous read only when bucket is public and file is Public.

**UI:** Gallery shows “Bucket access: Public” or “Private” with **Set public** / **Set private**, and each file shows a **Public** / **Private** badge and **Make public** / **Make private** button. List API returns `isPublic` per file from the object ACL.

**How to verify access**

1. **Bucket private:** Set bucket to Private. Upload a file. Direct MinIO URL in incognito → **Access Denied** (even if file is marked Public).
2. **Bucket public, file private:** Set bucket to Public. Leave file as Private. Direct URL in incognito → **Access Denied**.
3. **Bucket public, file public:** Click **Make public** on that file. Direct URL in incognito → **file loads**.
4. **File private again:** Click **Make private**. Same direct URL in incognito → **Access Denied**.
5. **Bucket private again:** Set bucket to Private. No anonymous access to any file.
6. **MinIO Console:** When bucket is public, it has a policy (Allow GetObject). Object ACLs can be checked per object if the console supports it.

---

## 7.2 Presigned URLs (How They Work & How to Test)

**What is a presigned URL?**

A presigned URL is a temporary URL that lets someone access an object in MinIO (or S3) **without sending credentials**. The URL includes a signature and an expiry time. The backend signs the URL with the MinIO secret key; MinIO verifies the signature and expiry when the URL is used.

**In this app:**

- **GET presigned URLs** – Used for **view** and **download**. You call `GET /api/files/presigned-url/:key` with your **Bearer token**; the backend returns `{ url, expiresIn }`. The frontend uses `url` in a new tab (View for any file type) or for download. The browser fetches directly from MinIO; no auth header is sent to MinIO.
- **PUT presigned URLs** – Used for **upload**. The frontend calls `POST /api/files/presigned-upload-url` with body `{ "key": "filename.pdf" }` (key is sanitized by the backend). The backend returns `{ url, key, expiresIn }`. The frontend then uploads by sending `PUT` to that URL with the file body and `Content-Type`. The file is written directly to MinIO; the backend never streams the file.

**Flow (GET):**

1. User is logged in; frontend has a valid access token.
2. Frontend calls: `GET /api/files/presigned-url/photo.jpg` with `Authorization: Bearer <token>`.
3. Backend verifies JWT, resolves user and bucket, calls MinIO’s `getPresignedGetUrl(bucket, key, expiresIn)` (e.g. 1 hour).
4. Backend returns: `{ "url": "https://minio.../bucket/photo.jpg?X-Amz-...", "expiresIn": 3600 }`.
5. Frontend uses `url` in `<img src={url}>` or `window.open(url)` for download. Browser requests that URL **without** any auth header; MinIO validates the signature and expiry and serves the file.

**How to test:**

1. **Get a presigned URL (with auth):**
   - From the UI: open a file (View or Download). The app will request a presigned URL under the hood; you can copy the image/video URL or the download link from dev tools (Network tab or “Copy link” if you add it).
   - Or with curl (replace with your token and backend URL and key):
     ```bash
     curl -s -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
       "http://localhost:3001/api/files/presigned-url/photo.jpg"
     ```
   - Response example: `{ "url": "http://minio:9000/gallery-john/photo.jpg?X-Amz-Algorithm=...&X-Amz-Credential=...&X-Amz-Date=...&X-Amz-Expires=3600&X-Amz-Signature=..." }`

2. **Use the URL without auth (GET):**
   - Paste the `url` in a new browser tab, or:
     ```bash
     curl -s -o downloaded.jpg "PASTE_THE_PRESIGNED_URL_HERE"
     ```
   - The file should load or download. No `Authorization` header is needed.

3. **After expiry:**
   - Wait until the URL has expired (e.g. 1 hour), or temporarily set a short `expiresIn` in the backend and request a new URL.
   - Open the same URL again. MinIO should return 403 (or “Request has expired”) because the signature is no longer valid.

**Upload (PUT) presigned URL – flow and how to verify**

1. **Flow:** Frontend requests `POST /api/files/presigned-upload-url` with `{ "key": "myfile.pdf" }` and auth. Backend sanitizes the key, ensures the user’s bucket exists, and returns `{ url, key, expiresIn }`. Frontend sends `PUT <url>` with body = file and `Content-Type: <file.type>`. MinIO accepts the PUT using the signature in the URL; no auth header is sent to MinIO.

2. **Verify GET presigned URL:** In the UI, click **View** on any file (or the file name). The file should open in a new tab. In Network tab you should see a request to `/api/files/presigned-url/...` then the browser loading the returned URL. Using the same URL in another tab (or curl without auth) should show the file until it expires.

3. **Verify PUT presigned URL:** Upload a file from the UI. In Network tab you should see: (1) `POST /api/files/presigned-upload-url` with body `{ "key": "<filename>" }`, response `{ url, key, expiresIn }`; (2) a `PUT` request to the MinIO host (the `url`), with the file as body. The upload should succeed and the new file appear in the list. If the PUT fails (e.g. 403 or CORS), ensure MinIO allows CORS for your frontend origin and that the PUT URL is used within `expiresIn` seconds.

**Summary:** GET presigned URLs = temporary view/download links. PUT presigned URLs = direct upload to MinIO; the app uses them for all uploads.

---

## 8. Project Structure (Relevant Parts)

```
gallery-miniio/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app, CORS, routes
│   │   ├── auth.js           # JWT verification middleware (JWKS)
│   │   ├── minio.js          # S3 client, bucket per user, list/put/get/delete/copy
│   │   └── routes/
│   │       ├── auth.js       # login, register, refresh
│   │       └── files.js      # list, trash, upload, download, trash/restore/delete
│   └── .env.example
├── frontend/
│   ├── app/                  # Next.js App Router pages
│   ├── context/
│   │   └── AuthContext.jsx   # Auth state, login, register, logout, getToken, tryRefresh
│   ├── lib/
│   │   └── api.js           # All API calls (auth + files)
│   └── .env.example
├── docker-compose.yml       # Keycloak + MinIO
├── .env.example             # Root env reference
├── README.md
└── PROJECT_GUIDE.md         # This file
```

---

## 9. Quick Checklist

- [ ] Keycloak running; realm `gallery`, client `gallery-app`, Direct access grants enabled.  
- [ ] Keycloak Email (SMTP) configured so verification emails can be sent.  
- [ ] Backend `.env` has correct Keycloak and MinIO settings; restart after changing keys.  
- [ ] Frontend `.env.local` has `NEXT_PUBLIC_API_URL` pointing to backend.  
- [ ] After sign up, user gets verification email and must verify before login (if realm requires it).  
- [ ] File APIs require `Authorization: Bearer <access_token>`; frontend uses `getToken()` from AuthContext.

---

*End of Project Guide*
