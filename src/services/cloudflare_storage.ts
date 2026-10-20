import { S3Client } from 'bun';
import path from 'path';
import fs from 'fs';
import randomToken from '../utils/random_token';

// Configuration from environment
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET || process.env.R2_BUCKET_NAME || '';
const publicUrlConfig = process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;

const localUploadDir = process.env.UPLOAD_DIR || './uploads';

// Ensure local upload dir exists for fallback
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

let s3ClientInstance: S3Client | null = null;

export function isCloudflareConfigured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucket);
}

/** Raster images only. SVG is left out on purpose: it can carry scripts. */
export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** A folder name from a request, reduced to safe characters. */
export function safeFolder(folder: unknown, fallback = 'uploads'): string {
  const cleaned = String(folder ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  return cleaned || fallback;
}

export function getR2Client(): S3Client | null {
  if (!isCloudflareConfigured()) {
    return null;
  }
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      bucket,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      region: 'auto',
    });
  }
  return s3ClientInstance;
}

export function getPublicUrl(key: string): string {
  if (publicUrlConfig) {
    const base = publicUrlConfig.replace(/\/+$/, '');
    return `${base}/${key}`;
  }
  // The bucket's API address (…r2.cloudflarestorage.com) is private, so a link built from it never opens in a browser.
  if (accountId && bucket) throw new Error('R2_PUBLIC_URL is not set: add the bucket\'s public URL (https://pub-….r2.dev or a custom domain) to .env');
  return `/uploads/${key}`;
}

export interface UploadOptions {
  key?: string;
  prefix?: string;
  contentType?: string;
  originalName?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  contentType?: string;
}

/**
 * Uploads a file buffer or stream to Cloudflare R2 (with local fallback if unconfigured).
 */
export async function uploadToCloudflare(
  data: ArrayBuffer | Uint8Array | Buffer | Blob,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const ext = IMAGE_TYPES[options.contentType ?? ''] ?? 'png';
  const prefix = options.prefix ? `${options.prefix.replace(/^\/+|\/+$/g, '')}/` : '';
  const key = options.key || `${prefix}${Date.now()}_${randomToken(9)}.${ext}`;

  const client = getR2Client();
  // Never use `.buffer` of a Node Buffer: small Buffers share a pooled ArrayBuffer holding other data.
  const buffer = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const size = buffer.byteLength;

  if (client) {
    // Upload directly to Cloudflare R2 using Bun's built-in S3Client
    await client.write(key, buffer, {
      type: options.contentType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });
    return {
      url: getPublicUrl(key),
      key,
      size,
      contentType: options.contentType,
    };
  }

  // Local fallback when Cloudflare R2 credentials are not set: flat folder, prefix folded into the file name.
  const localName = key.replace(/\//g, '__');
  await Bun.write(path.join(localUploadDir, localName), buffer);

  return {
    url: `/uploads/${localName}`,
    key,
    size,
    contentType: options.contentType,
  };
}

/**
 * Parses and uploads a base64 Data URL (e.g. data:image/png;base64,...) to Cloudflare R2.
 */
export async function uploadDataUrlToCloudflare(
  dataUrl: string,
  prefix = 'images'
): Promise<UploadResult | null> {
  const match = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match || !match[1] || !match[2] || !IMAGE_TYPES[match[1]]) {
    return null;
  }

  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }

  return await uploadToCloudflare(buffer, { prefix, contentType });
}

/**
 * Deletes an object from Cloudflare R2 (or local fallback).
 */
export async function deleteFromCloudflare(key: string): Promise<boolean> {
  const client = getR2Client();
  if (client) {
    try {
      await client.delete(key);
      return true;
    } catch {
      return false;
    }
  }

  const filePath = path.join(localUploadDir, path.basename(key.replace(/\//g, '__')));
  try {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Generates an AWS Signature Version 4 presigned URL for direct client-to-Cloudflare-R2 uploads.
 */
export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  prefix = 'uploads',
  expiresIn = 3600
): Promise<{ uploadUrl: string; publicUrl: string; key: string } | null> {
  const client = getR2Client();
  const ext = IMAGE_TYPES[contentType] ?? 'png';
  const key = `${prefix}/${Date.now()}_${randomToken(9)}.${ext}`;

  if (!client) {
    return null;
  }

  // The signature covers the content type, so the browser cannot upload something else under this key.
  const uploadUrl = client.presign(key, {
    method: 'PUT',
    expiresIn,
    type: contentType,
  });

  return {
    uploadUrl,
    publicUrl: getPublicUrl(key),
    key,
  };
}

export default {
  isConfigured: isCloudflareConfigured,
  upload: uploadToCloudflare,
  uploadDataUrl: uploadDataUrlToCloudflare,
  delete: deleteFromCloudflare,
  getPresignedUrl: getPresignedUploadUrl,
  getPublicUrl,
};
