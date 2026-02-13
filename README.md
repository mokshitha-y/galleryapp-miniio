# Gallery App (Keycloak + MinIO)

A gallery application with **Keycloak** (in the background) for user storage and authentication and **MinIO** (S3-compatible) for storage. The app provides **its own Login and Sign up pages**; Keycloak is never shown in the UI. Each user gets their **own MinIO bucket** (`gallery-{userId}`). In the UI, users can **upload** (single or bulk), **view**, **download**, and **delete** files (including video). Delete supports **soft delete** (move to recycle bin) and **hard delete** (permanent). Recycle bin allows **restore** or **permanent delete**.

## Prerequisites

- Node.js 18+
- Docker and Docker Compose

## Quick start

### 1. Start Keycloak and MinIO

```bash
docker compose up -d
```

- **Keycloak**: http://localhost:8080 (admin / admin). Create realm `gallery` and client `gallery-app` if not auto-imported; enable User registration. All app users are Keycloak users.
- **MinIO Console**: http://localhost:9001 (minioadmin / minioadmin). Each user gets a dedicated bucket (e.g. `gallery-abc123`) when they first upload.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

API runs at http://localhost:4000. **MinIO credentials**: set `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in `.env`. If you change these (or rotate keys), restart the backend so it picks up the new values.

### 3. Frontend (Next.js, App Router)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

App runs at http://localhost:3000.

### 4. Use the app

- Open http://localhost:3000 → use **Log in** or **Sign up** (custom UI; Keycloak runs in the background).
- **Upload**: single or multiple files (bulk); images and video supported.
- **View**: open image/video in a modal.
- **Download**: save file to device.
- **Bucket public/private**: toggle whether anonymous access is allowed; when Public, only files marked Public are readable via direct link.
- **Make public / Make private** (per file): control which files can be opened via direct link when the bucket is Public (prefix-based; no object ACLs).
- **Move to recycle bin**: soft delete (file moved to `trash/` in your bucket).
- **Delete permanently**: hard delete from main list or from recycle bin.
- **Recycle bin** tab: restore or permanently delete trashed files.

## Project structure

- `backend/` – Express API: JWT (Keycloak), one bucket per user, list/upload/download, bucket and per-file public/private (prefix-based), soft and hard delete, trash/restore.
- `frontend/` – Next.js 14 (App Router), Keycloak JS, gallery UI with view/download/upload, bucket and file visibility, recycle bin.
- `keycloak/realm/` – Keycloak realm import (optional).
- `docker-compose.yml` – Keycloak + MinIO.
- `VERIFICATION.md` – How to verify the 3 access cases (bucket private, public+file private, public+file public).
- `PROJECT_GUIDE.md` – Full API reference and setup details.

## Environment

- **Backend** (`backend/.env`): `KEYCLOAK_*`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `PORT`, `FRONTEND_ORIGIN`. Changing access/secret keys and restarting the backend applies new MinIO credentials.
- **Frontend** (`frontend/.env.local`): `NEXT_PUBLIC_KEYCLOAK_*`, `NEXT_PUBLIC_API_URL`.

## Scripts

- **Backend** (`backend/`): `npm run dev` (watch), `npm start`.
- **Frontend** (`frontend/`): `npm run dev`, `npm run build`, `npm start`, `npm run lint`.
