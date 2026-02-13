# Verification: Public / Private Access (3 production cases)

Access is **prefix-based** (no object ACLs): public files live under `public/`, private at root. Bucket policy allows anonymous `GetObject` only on `public/*` when the bucket is "Public".

## 3 cases to verify

| # | Case | Expected (direct URL in incognito) |
|---|------|------------------------------------|
| 1 | **Bucket private** | Any file → **Access Denied** |
| 2 | **Bucket public + file private** | Private file (at root) → **Access Denied** |
| 3 | **Bucket public + file public** | Public file (`public/*`) → **File loads** |

## How to verify

1. **Start** MinIO (e.g. port 9000), backend, and frontend. Log in as a test user.

2. **Case 1 – Bucket private**
   - Set bucket to **Private** (Bucket: Private → "Set private" if needed).
   - Upload a file (or use an existing one). Note the object key (e.g. `photo.jpg` or `public/photo.jpg`).
   - Direct URL: `http://<minio-host>:9000/<bucket>/<key>`  
     Example: `http://localhost:9000/gallery-testuser/photo.jpg`
   - Open in **incognito** (no auth). → **Access Denied**.

3. **Case 2 – Bucket public, file private**
   - Set bucket to **Public**.
   - Ensure the file is **Private** (badge "Private"; if it says "Public", click "Make private").
   - Direct URL for that file (root key, e.g. `http://localhost:9000/gallery-testuser/photo.jpg`) in incognito. → **Access Denied**.

4. **Case 3 – Bucket public, file public**
   - Keep bucket **Public**. Click **Make public** on a file.
   - List returns that file with key `public/<name>` and badge "Public".
   - Direct URL: `http://<minio-host>:9000/<bucket>/public/<name>`  
     Example: `http://localhost:9000/gallery-testuser/public/photo.jpg`
   - Open in **incognito**. → **File loads**.

## Direct URL format

- **Private file:** `http://<minio>:9000/<bucket>/<filename>` (e.g. `photo.jpg`) → Access Denied when bucket public.
- **Public file:** `http://<minio>:9000/<bucket>/public/<filename>` → loads when bucket is Public.

Bucket name = `gallery-<username>` (e.g. `gallery-john`).
