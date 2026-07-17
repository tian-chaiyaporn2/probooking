import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { devAuthEnabled } from "../auth/dev-mode.util.js";

/**
 * Application-layer encryption for sensitive columns at rest (§7.3 / Thai PDPA).
 *
 * A single DB dump otherwise yields every professional's licence number and every clinic's
 * address in plaintext — "sensitive personal data" with no protection. This encrypts those
 * fields before they reach Postgres and decrypts on the way out, so the ciphertext is all
 * the database (or its backups) ever hold.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather than
 * returning garbage. Each value gets a fresh random IV, so equal plaintexts do not produce
 * equal ciphertexts — which is also why this is NOT used on `User.phone`: that column is the
 * unique OTP login key and must be looked up by value. Encrypting a lookup key needs
 * deterministic encryption or a separate blind index (HMAC), which is a larger change;
 * phone stays plaintext for now, masked in logs, and noted in the schema.
 *
 * Format: `enc:v1:<base64(iv|tag|ciphertext)>`. The version prefix lets reads tell an
 * encrypted value from a legacy plaintext one, so decryption degrades gracefully over rows
 * written before the migration ran, and lets a future key rotation add `v2` without
 * guessing.
 */
const PREFIX = "enc:v1:";
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (hex) {
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
    }
    cachedKey = buf;
    return buf;
  }
  // Encrypted-at-rest data must survive a restart, so a per-process random key (as JWT
  // signing uses) would be wrong here — it would make yesterday's rows unreadable. Under the
  // dev opt-in we use a FIXED, published dev key: the threat model is a database dump, and a
  // dev database holds only fake data. Production has no key => refuse, same as JWT_SECRET.
  if (devAuthEnabled()) {
    cachedKey = Buffer.alloc(32, "probook-dev-field-key-not-secret!".slice(0, 32));
    return cachedKey;
  }
  throw new Error(
    "FIELD_ENCRYPTION_KEY must be set to a 32-byte hex key (or set AUTH_DEV_MODE=true for local dev)",
  );
}

/** Encrypt a value for storage. Idempotent-safe: an already-encrypted value is returned as-is. */
export function encryptField(plaintext: string): string {
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted; don't double-wrap
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypt a stored value. A value without the version prefix is a legacy plaintext row
 * (written before the migration) and is returned unchanged — so a partially-migrated table
 * reads correctly rather than throwing.
 */
export function decryptField(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Boot-time assertion so a missing key fails fast rather than at the first write. */
export function assertFieldKeyConfigured(): void {
  key();
}

/** Testing seam: forget the cached key after an env change. */
export function resetFieldKeyCache(): void {
  cachedKey = null;
}
