import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Application-level encryption for highly sensitive personal data (IC number).
 * AES-256-GCM with a random 96-bit IV; the auth tag detects tampering.
 * Key: MYSANAD_PII_ENCRYPTION_KEY = 32 random bytes, base64 (server-only env var).
 * Stored format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */
const VERSION = 'v1';

function getKey(): Buffer | null {
  const raw = process.env.MYSANAD_PII_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('MYSANAD_PII_ENCRYPTION_KEY mesti 32 bait (base64).');
  return key;
}

export function isPiiEncryptionConfigured(): boolean {
  try {
    return getKey() !== null;
  } catch {
    return false;
  }
}

export function encryptPii(plaintext: string): string {
  const key = getKey();
  if (!key) throw new Error('Penyulitan data peribadi belum dikonfigurasi.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Returns null for anything that is not a valid, untampered v1 value. */
export function decryptPii(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = getKey();
  if (!key) return null;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** "880101-03-1234" -> "******-**-1234" */
export function maskIc(ic: string | null): string | null {
  if (!ic) return null;
  const digits = ic.replace(/\D/g, '');
  return digits.length === 12 ? `******-**-${digits.slice(8)}` : null;
}
