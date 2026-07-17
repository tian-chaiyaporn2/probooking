-- Encrypt User.phone at rest and move its uniqueness/lookup to a keyed blind index.
--
-- phone is the OTP login key, looked up by value, so it could not take random-IV encryption
-- while the other sensitive columns did. The blind index (HMAC of the phone, app-computed)
-- restores unique + lookup over ciphertext.
--
-- Existing rows: `phoneHash` is added nullable and the plaintext phone stays readable
-- (decryptField tolerates legacy plaintext), so the app keeps working immediately. The
-- backfill script `pnpm --filter @probook/api encrypt-pii` then computes each hash and
-- encrypts each phone. On a fresh database (CI) there are no rows and nothing to backfill.

ALTER TABLE "User" ADD COLUMN "phoneHash" TEXT;

-- Uniqueness now lives on the hash. Postgres treats NULLs as distinct in a unique index,
-- so the many pre-backfill rows with a null hash don't collide; every new registration
-- writes a hash and is covered.
CREATE UNIQUE INDEX "User_phoneHash_key" ON "User"("phoneHash");

-- The plaintext-phone unique constraint is retired — the column now holds ciphertext, which
-- is not unique (fresh IV per row). Uniqueness is the blind index's job.
DROP INDEX IF EXISTS "User_phone_key";
