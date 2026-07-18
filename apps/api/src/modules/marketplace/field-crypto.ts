// Field encryption + blind index live in @probook/db so the API and the Prisma seed share
// one implementation (a drifting second copy would produce hashes that don't match). This
// re-export keeps the existing import paths in the API stable.
export {
  encryptField,
  encryptFieldIfPlain,
  decryptField,
  blindIndex,
  assertFieldKeyConfigured,
  resetFieldKeyCache,
} from "@probook/db";
