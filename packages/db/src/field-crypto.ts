// Moved to @probook/db so both the API and the Prisma seed can encrypt/hash consistently.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { normalizePhone } from "./phone.util.js";

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
 * equal ciphertexts — which is also why phone lookup uses a separate blind index
 * (`blindIndex` / `phoneHash`): the ciphertext cannot be queried by value, but the HMAC
 * of the normalized phone can. Licence numbers, addresses, and message bodies are encrypted
 * the same way; phones are encrypted *and* hashed for login.
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
  if (process.env.AUTH_DEV_MODE === "true" && process.env.NODE_ENV !== "production") {
    cachedKey = Buffer.alloc(32, "probook-dev-field-key-not-secret!".slice(0, 32));
    return cachedKey;
  }
  throw new Error(
    "FIELD_ENCRYPTION_KEY must be set to a 32-byte hex key (or set AUTH_DEV_MODE=true for local dev)",
  );
}

/** Encrypt a value for storage. Always encrypts — never trust a client-supplied `enc:v1:` prefix. */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Encrypt only when the value is still plaintext. For migrations/backfill on trusted DB
 * reads — never pass attacker-controlled input through this.
 */
export function encryptFieldIfPlain(value: string): string {
  if (value.startsWith(PREFIX)) return value;
  return encryptField(value);
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

/**
 * Deterministic blind index for a value that must be looked up while stored encrypted —
 * `User.phone` above all, which is the unique OTP login key. Random-IV encryption cannot be
 * queried or made unique, so the encrypted phone is for retrieval and THIS hash is the
 * lookup/uniqueness key.
 *
 * HMAC-SHA256 keyed by the field key (domain-separated so it can never collide with any
 * other use of the key), hex-encoded. Keyed, so a stolen database of hashes cannot be
 * brute-forced without the key the way a plain SHA of a phone number could.
 */
export function blindIndex(plaintext: string): string {
  return createHmac("sha256", key())
    .update(`blind-index:${normalizePhone(plaintext)}`)
    .digest("hex");
}

/** Boot-time assertion so a missing key fails fast rather than at the first write. */
export function assertFieldKeyConfigured(): void {
  key();
}

/** Testing seam: forget the cached key after an env change. */
export function resetFieldKeyCache(): void {
  cachedKey = null;
}
