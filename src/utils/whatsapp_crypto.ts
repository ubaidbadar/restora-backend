import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * WhatsApp webhook cryptography.
 * - Signature: HMAC-SHA256 of the raw request body, compared with the
 *   X-Hub-Signature-256 header (format "sha256=<hex>"). Uses a
 *   timing-safe comparison; a missing or malformed header never matches.
 * - Token encryption: AES-256-GCM with a server-side key
 *   (WHATSAPP_TOKEN_ENCRYPTION_KEY, 64 hex chars = 32 bytes).
 *   Encrypted form is "ivHex:authTagHex:ciphertextHex". Tokens are
 *   never logged, in plain text or encrypted.
 */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expectedHex = signatureHeader.slice('sha256='.length);
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  const actual = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function encryptionKey(): Buffer {
  const hex = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptWhatsAppToken(token: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptWhatsAppToken(encrypted: string): string {
  const key = encryptionKey();
  const [ivHex, tagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error('Invalid encrypted WhatsApp token format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]).toString('utf8');
}
