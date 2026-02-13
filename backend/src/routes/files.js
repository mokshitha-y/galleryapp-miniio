/**
 * File routes: list, upload, presigned URLs, download, trash/restore, visibility, bucket access.
 * All routes require auth. Storage is prefix-based: public files under public/, private at root.
 */
import { Router } from 'express';
import multer from 'multer';
import {
  ensureUserBucket,
  listObjects,
  putObject,
  getObject,
  deleteObject,
  copyObject,
  getPresignedGetUrl,
  getPresignedPutUrl,
  setBucketPolicyPublic,
  setBucketPolicyPrivate,
  getBucketPolicy,
  TRASH_PREFIX,
  PUBLIC_PREFIX,
} from '../minio.js';

const router = Router();
const MAX_FILE_SIZE_MB = 100;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || 'file';
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** True if bucket has policy allowing anonymous GetObject on public/*. */
async function isBucketPublic(bucket) {
  const policy = await getBucketPolicy(bucket);
  if (!policy?.Statement) return false;
  return policy.Statement.some(
    (s) =>
      s.Effect === 'Allow' &&
      (s.Principal === '*' || (s.Principal && String(s.Principal.AWS) === '*')) &&
      Array.isArray(s.Action) &&
      s.Action.includes('s3:GetObject') &&
      Array.isArray(s.Resource) &&
      s.Resource.some((r) => String(r).includes(bucket) && String(r).includes(PUBLIC_PREFIX))
  );
}

// -----------------------------------------------------------------------------
// List
// -----------------------------------------------------------------------------

/** GET /api/files – list files. isPublic from key prefix (public/ = public). Sorted by lastModified desc. */
router.get('/', async (req, res) => {
  try {
    const { username } = req.user;
    const bucket = await ensureUserBucket(username);
    const items = await listObjects(bucket, { prefix: '' });
    const files = items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
    res.json({ files });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/** GET /api/files/trash – list trashed files. Sorted by lastModified desc (recent first). */
router.get('/trash', async (req, res) => {
  try {
    const { username } = req.user;
    const bucket = await ensureUserBucket(username);
    const items = await listObjects(bucket, { listTrash: true });
    const files = items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
    res.json({ files });
  } catch (err) {
    console.error('List trash error:', err);
    res.status(500).json({ error: 'Failed to list trash' });
  }
});

// -----------------------------------------------------------------------------
// Upload & presigned URLs
// -----------------------------------------------------------------------------

/** POST /api/files/upload – upload via backend. Bucket always private; access via presigned URLs only. */
router.post('/upload', upload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const { username } = req.user;
    const bucket = await ensureUserBucket(username);
    const results = [];
    for (const file of files) {
      const safeName = sanitizeFilename(file.originalname || 'file');
      const key = safeName;
      await putObject(bucket, key, file.buffer, file.mimetype || 'application/octet-stream');
      results.push({ key, name: safeName });
    }
    res.status(201).json({ uploaded: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file(s)' });
  }
});

/** POST /api/files/presigned-upload-url – get presigned PUT URL for direct upload. No ACL. */
router.post('/presigned-upload-url', async (req, res) => {
  try {
    const rawKey = req.body?.key ?? req.body?.name ?? 'file';
    const safeName = sanitizeFilename(typeof rawKey === 'string' ? rawKey : 'file');
    const key = safeName;
    const { username } = req.user;
    const bucket = await ensureUserBucket(username);
    const expiresIn = Math.min(Math.max(parseInt(req.body?.expiresIn, 10) || 900, 60), 3600);
    const url = await getPresignedPutUrl(bucket, key, expiresIn);
    res.json({ url, key, expiresIn });
  } catch (err) {
    console.error('Presigned upload URL error:', err);
    res.status(500).json({ error: 'Failed to generate upload link' });
  }
});

/** GET /api/files/presigned-url/:key – get temporary URL for view/download (no proxy). ?expiresIn=3600. ?disposition=attachment for download. */
router.get('/presigned-url/:key(*)', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    const expiresIn = Math.min(Math.max(parseInt(req.query.expiresIn, 10) || 3600, 60), 604800); // 1 min to 7 days
    const disposition = req.query.disposition === 'attachment' ? 'attachment' : undefined;
    const bucket = await ensureUserBucket(username);
    const url = await getPresignedGetUrl(bucket, key, expiresIn, { disposition });
    res.json({ url, expiresIn });
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Presigned URL error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate link' });
  }
});

// -----------------------------------------------------------------------------
// Download & stream
// -----------------------------------------------------------------------------

/** GET /api/files/download/:key – stream file (inline for view) – fallback. */
router.get('/download/:key(*)', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
    const bucket = await ensureUserBucket(username);
    const stream = await getObject(bucket, key);
    const filename = key.replace(/^trash\//, '').split('/').pop() || 'download';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    stream.pipe(res);
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Download error:', err);
    res.status(500).json({ error: err.message || 'Failed to download' });
  }
});

// -----------------------------------------------------------------------------
// Trash, restore, delete
// -----------------------------------------------------------------------------

/** POST /api/files/trash/:key – soft delete (move to recycle bin) */
router.post('/trash/:key(*)', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    if (key.startsWith(TRASH_PREFIX)) {
      return res.status(400).json({ error: 'File is already in trash' });
    }
    const bucket = await ensureUserBucket(username);
    const trashKey = TRASH_PREFIX + key;
    await copyObject(bucket, key, trashKey);
    await deleteObject(bucket, key);
    res.status(200).json({ message: 'Moved to recycle bin' });
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Soft delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to move to recycle bin' });
  }
});

/** POST /api/files/restore/:key – restore from trash (key = trash/filename) */
router.post('/restore/:key(*)', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    const trashKey = key.startsWith(TRASH_PREFIX) ? key : TRASH_PREFIX + key;
    const restoreKey = trashKey.slice(TRASH_PREFIX.length);
    const bucket = await ensureUserBucket(username);
    await copyObject(bucket, trashKey, restoreKey);
    await deleteObject(bucket, trashKey);
    res.status(200).json({ message: 'Restored', key: restoreKey });
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Restore error:', err);
    res.status(500).json({ error: err.message || 'Failed to restore' });
  }
});

/** DELETE /api/files/trash/:key – hard delete from recycle bin */
router.delete('/trash/:key(*)', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    const trashKey = key.startsWith(TRASH_PREFIX) ? key : TRASH_PREFIX + key;
    const bucket = await ensureUserBucket(username);
    await deleteObject(bucket, trashKey);
    res.status(204).send();
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Hard delete from trash error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete permanently' });
  }
});

/** DELETE /api/files/:key – hard delete from main (permanent) or soft delete */
router.delete('/:key(*)', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    const permanent = req.query.permanent === 'true' || req.query.permanent === '1';
    const bucket = await ensureUserBucket(username);
    if (key.startsWith(TRASH_PREFIX)) {
      await deleteObject(bucket, key);
      return res.status(204).send();
    }
    if (permanent) {
      await deleteObject(bucket, key);
      return res.status(204).send();
    }
    const trashKey = TRASH_PREFIX + key;
    await copyObject(bucket, key, trashKey);
    await deleteObject(bucket, key);
    res.status(200).json({ message: 'Moved to recycle bin' });
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete' });
  }
});

// -----------------------------------------------------------------------------
// Per-file visibility (public/ prefix) & bucket access
// -----------------------------------------------------------------------------

/** PATCH /api/files/:key/visibility – set per-file public or private (prefix-based: move to/from public/). Body: { "public": true|false } */
router.patch('/:key(*)/visibility', async (req, res) => {
  try {
    const { username } = req.user;
    const key = decodeURIComponent(req.params.key);
    if (key.startsWith(TRASH_PREFIX)) {
      return res.status(400).json({ error: 'Cannot change visibility of trashed files' });
    }
    const bucket = await ensureUserBucket(username);
    const wantPublic = req.body?.public === true;
    const isCurrentlyPublic = key.startsWith(PUBLIC_PREFIX);
    if (wantPublic === isCurrentlyPublic) {
      return res.json({ key, public: wantPublic });
    }
    let newKey;
    if (wantPublic) {
      newKey = PUBLIC_PREFIX + key;
      await copyObject(bucket, key, newKey);
      await deleteObject(bucket, key);
    } else {
      newKey = key.slice(PUBLIC_PREFIX.length);
      await copyObject(bucket, key, newKey);
      await deleteObject(bucket, key);
    }
    res.json({ key: newKey, public: wantPublic });
  } catch (err) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Visibility error:', err);
    res.status(500).json({ error: err.message || 'Failed to update visibility' });
  }
});

/** GET /api/files/bucket-access – whether bucket is public or private. */
router.get('/bucket-access', async (req, res) => {
  try {
    const { username } = req.user;
    const bucket = await ensureUserBucket(username);
    const publicProfile = await isBucketPublic(bucket);
    res.json({ public: publicProfile });
  } catch (err) {
    console.error('Bucket access error:', err);
    res.status(500).json({ error: 'Failed to get bucket access' });
  }
});

/** PATCH /api/files/bucket-access – set bucket public or private. Body: { "public": true|false } */
router.patch('/bucket-access', async (req, res) => {
  try {
    const { username } = req.user;
    const bucket = await ensureUserBucket(username);
    const wantPublic = req.body?.public === true;
    if (wantPublic) {
      await setBucketPolicyPublic(bucket);
    } else {
      await setBucketPolicyPrivate(bucket);
    }
    res.json({ public: wantPublic });
  } catch (err) {
    console.error('Set bucket access error:', err);
    res.status(500).json({ error: err.message || 'Failed to set bucket access' });
  }
});

export default router;
