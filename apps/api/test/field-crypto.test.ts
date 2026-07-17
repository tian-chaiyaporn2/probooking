import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptField,
  decryptField,
  resetFieldKeyCache,
} from "../src/modules/marketplace/field-crypto.js";

describe("field-crypto (§7.3 encryption at rest)", () => {
  beforeEach(() => {
    // A real 32-byte key, so the tests do not depend on the dev fallback.
    process.env.FIELD_ENCRYPTION_KEY = "a".repeat(64);
    resetFieldKeyCache();
  });

  it("round-trips a value", () => {
    const plain = "TH-LICENCE-4482201";
    const enc = encryptField(plain);
    expect(enc).not.toContain(plain); // ciphertext does not leak the plaintext
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decryptField(enc)).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    // Equal plaintexts must not yield equal ciphertexts — which is exactly why this is not
    // used on the unique phone login column.
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("reads legacy plaintext rows unchanged (graceful over a partial migration)", () => {
    expect(decryptField("plain address, never encrypted")).toBe("plain address, never encrypted");
  });

  it("does not double-wrap an already-encrypted value", () => {
    const once = encryptField("x");
    expect(encryptField(once)).toBe(once);
  });

  it("rejects a tampered ciphertext rather than returning garbage (GCM auth)", () => {
    const enc = encryptField("payout account 1234");
    // Flip a byte in the base64 body.
    const body = enc.slice("enc:v1:".length);
    const bytes = Buffer.from(body, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = "enc:v1:" + bytes.toString("base64");
    expect(() => decryptField(tampered)).toThrow();
  });

  it("cannot decrypt with the wrong key", () => {
    const enc = encryptField("secret");
    process.env.FIELD_ENCRYPTION_KEY = "b".repeat(64);
    resetFieldKeyCache();
    expect(() => decryptField(enc)).toThrow();
  });

  it("rejects a malformed key length", () => {
    process.env.FIELD_ENCRYPTION_KEY = "tooshort";
    resetFieldKeyCache();
    expect(() => encryptField("x")).toThrow(/32 bytes/);
  });
});
