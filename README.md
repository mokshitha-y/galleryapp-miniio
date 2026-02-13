# Gallery

A full-stack gallery app with custom login and sign-up. Each user has a dedicated object store bucket. Keycloak handles authentication; MinIO (S3-compatible) handles file storage.

---

## Tech stack

| Layer      | Technology |
|-----------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, Keycloak JS |
| **Backend**  | Node.js, Express, JWT (Keycloak JWKS), Multer |
| **Storage**  | MinIO (S3 API), AWS SDK v3, presigned URLs |
| **Auth**     | Keycloak (OIDC, password + refresh grant) |
| **Infra**    | Docker Compose (Keycloak + MinIO) |

---

## Features

- **Auth:** Custom login and registration UI; Keycloak in the background (no Keycloak UI in the app).
- **Storage:** One MinIO bucket per user (`gallery-{username}`). Upload (single or bulk), view, download.
- **Visibility:** Bucket-level and per-file public/private (prefix-based: public files under `public/`). When the bucket is public, only files marked public are readable via direct link.
- **Recycle bin:** Soft delete (move to `trash/`), restore, hard delete. Trash listed in a separate tab.
- **API:** REST over JSON. Presigned URLs for view/download and direct upload to MinIO.

---

## Project structure

```
gallery-miniio/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app, CORS, routes
│   │   ├── auth.js            # JWT verification (Keycloak JWKS)
│   │   ├── minio.js           # S3/MinIO client, bucket policy, list/put/copy/delete
│   │   └── routes/
│   │       ├── auth.js        # Login, register, refresh
│   │       └── files.js       # List, upload, presigned URL, download, trash, visibility, bucket access
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── layout.jsx
│   │   ├── page.jsx            # Home
│   │   ├── login/page.jsx
│   │   ├── register/page.jsx
│   │   └── gallery/
│   │       ├── layout.jsx
│   │       └── page.jsx        # Gallery UI (upload, list, bucket/file visibility, trash)
│   ├── components/
│   │   └── ViewModal.jsx       # Image/video/PDF preview
│   ├── context/
│   │   └── AuthContext.jsx     # Token state, login, logout, refresh
│   ├── lib/
│   │   ├── api.js              # API client
│   │   └── keycloak.js         # Keycloak init
│   ├── package.json
│   ├── next.config.js
│   └── .env.example
├── keycloak/
│   └── realm/
│       └── gallery-realm.json # Optional realm import
├── docker-compose.yml          # Keycloak + MinIO
├── .env.example                # Env template (root)
└── PROJECT_GUIDE.md            # Full API reference and setup
```

---

## Prerequisites

- **Node.js** 18+
- **Docker** and **Docker Compose**

---

## Quick start

### 1. Start Keycloak and MinIO

```bash
docker compose up -d
```

- Keycloak: http://localhost:8080 (admin / admin). Realm `gallery`, client `gallery-app`; enable user registration if not imported.
- MinIO Console: http://localhost:9001 (minioadmin / minioadmin).

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

API: http://localhost:4000. Set `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in `.env` to match MinIO.

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

App: http://localhost:3000. Use **Log in** or **Sign up**; upload, view, download, and manage visibility and recycle bin from the gallery.

---

## Scripts

| Location   | Command         | Description              |
|-----------|-----------------|--------------------------|
| `backend/`  | `npm run dev`   | Run API with watch       |
| `backend/`  | `npm start`     | Run API (production)     |
| `frontend/` | `npm run dev`   | Next.js dev server       |
| `frontend/` | `npm run build` | Next.js production build |
| `frontend/` | `npm start`     | Run production build     |

---

## Environment

| File | Purpose |
|------|---------|
| `backend/.env` | `KEYCLOAK_*`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `PORT`, `FRONTEND_ORIGIN` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL`, optional `NEXT_PUBLIC_KEYCLOAK_*` |

Copy from `.env.example` in each directory. Restart the backend after changing MinIO credentials.

---

## Docs

- **PROJECT_GUIDE.md** — API reference, Keycloak and MinIO setup, presigned URLs.
