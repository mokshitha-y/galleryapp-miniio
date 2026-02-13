/**
 * MinIO / S3 client: one bucket per user (gallery-{username}), prefix-based public/private.
 * Public files live under public/; bucket policy allows anonymous GetObject only on public/* when bucket is Public.
 */
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
const region = process.env.MINIO_REGION || 'us-east-1';

export const TRASH_PREFIX = 'trash/';
export const PUBLIC_PREFIX = 'public/';

const s3 = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: true,
});

function sanitizeBucketName(username) {
  const safe = String(username || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `gallery-${safe || 'default'}`;
}

/**
 * Ensure user bucket exists; return bucket name.
 */
export async function ensureUserBucket(username) {
  const bucket = sanitizeBucketName(username);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } else {
      throw err;
    }
  }
  return bucket;
}

/**
 * List objects. prefix '' = main list (excludes trash). listTrash: true = trash list.
 * Returns [{ key, size, lastModified, isPublic }]. isPublic = key.startsWith('public/').
 */
export async function listObjects(bucket, options = {}) {
  const { prefix = '', listTrash = false } = options;
  const listPrefix = listTrash ? TRASH_PREFIX : prefix;
  const out = [];
  let continuationToken;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: listPrefix,
      ContinuationToken: continuationToken,
    });
    const resp = await s3.send(cmd);
    const contents = resp.Contents || [];
    for (const obj of contents) {
      const key = obj.Key;
      if (!key) continue;
      if (!listTrash && key.startsWith(TRASH_PREFIX)) continue;
      out.push({
        key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString?.() ?? '',
        isPublic: key.startsWith(PUBLIC_PREFIX),
      });
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}

export async function putObject(bucket, key, body, contentType = 'application/octet-stream') {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.isBuffer(body) ? body : Buffer.from(body),
      ContentType: contentType,
    })
  );
}

export async function getObject(bucket, key) {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  return resp.Body;
}

export async function deleteObject(bucket, key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function copyObject(bucket, sourceKey, destKey) {
  const copySource = encodeURIComponent(`${bucket}/${sourceKey}`);
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: copySource,
      Key: destKey,
    })
  );
}

export async function getPresignedGetUrl(bucket, key, expiresIn = 3600, options = {}) {
  const params = {
    Bucket: bucket,
    Key: key,
  };
  if (options.disposition === 'attachment') {
    params.ResponseContentDisposition = 'attachment';
  }
  const cmd = new GetObjectCommand(params);
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function getPresignedPutUrl(bucket, key, expiresIn = 900) {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function getBucketPolicy(bucket) {
  try {
    const resp = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    const policy = typeof resp.Policy === 'string' ? JSON.parse(resp.Policy) : resp.Policy;
    return policy;
  } catch (err) {
    if (err.name === 'NoSuchBucketPolicy' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Set bucket policy so only public/* is anonymously readable. Deny trash/*.
 */
export async function setBucketPolicyPublic(bucket) {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'DenyTrash',
        Effect: 'Deny',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: [`arn:aws:s3:::${bucket}/${TRASH_PREFIX}*`],
      },
      {
        Sid: 'AllowPublicReadOnly',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: [`arn:aws:s3:::${bucket}/${PUBLIC_PREFIX}*`],
      },
    ],
  };
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    })
  );
}

export async function setBucketPolicyPrivate(bucket) {
  try {
    await s3.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
  } catch (err) {
    if (err.name !== 'NoSuchBucketPolicy' && err.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
  }
}
