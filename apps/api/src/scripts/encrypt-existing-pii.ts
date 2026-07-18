import "../env.js"; // load DATABASE_URL + FIELD_ENCRYPTION_KEY before @probook/db
import { prisma } from "@probook/db";
import { encryptFieldIfPlain, blindIndex } from "../modules/marketplace/field-crypto.js";

const PREFIX = "enc:v1:";

/**
 * One-off backfill: encrypt PII columns written before field encryption existed.
 *
 * New writes are encrypted at the store boundary, and reads tolerate legacy plaintext — so
 * the app is correct without this. But "encrypted at rest" is not true of a table full of
 * plaintext rows, so this rewrites them. `encryptFieldIfPlain` no-ops on an already-encrypted
 * value, making the script safe to re-run and safe to interrupt.
 *
 *   node apps/api/dist/scripts/encrypt-existing-pii.js
 */
async function main() {
  let clinics = 0;
  for (const c of await prisma.clinicWorkspace.findMany({ select: { id: true, licenceNo: true, address: true } })) {
    const licenceNo = encryptFieldIfPlain(c.licenceNo);
    const address = encryptFieldIfPlain(c.address);
    if (licenceNo === c.licenceNo && address === c.address) continue; // already encrypted
    await prisma.clinicWorkspace.update({ where: { id: c.id }, data: { licenceNo, address } });
    clinics++;
  }

  let messages = 0;
  for (const m of await prisma.message.findMany({ select: { id: true, body: true } })) {
    const body = encryptFieldIfPlain(m.body);
    if (body === m.body) continue;
    await prisma.message.update({ where: { id: m.id }, data: { body } });
    messages++;
  }

  // User.phone: encrypt the value and backfill the blind index that lookups now use. A row
  // whose phone is already ciphertext AND already has a hash is skipped, so re-running is a
  // no-op. The hash must be derived from the PLAINTEXT phone, so this runs before the phone
  // would ever be re-encrypted — hence the "already encrypted" guard uses the prefix.
  let users = 0;
  for (const u of await prisma.user.findMany({ select: { id: true, phone: true, phoneHash: true } })) {
    const alreadyEncrypted = u.phone.startsWith(PREFIX);
    if (alreadyEncrypted && u.phoneHash) continue;
    // If still plaintext, the current value IS the phone; if already encrypted but missing a
    // hash (shouldn't happen), we cannot recover the plaintext, so skip with a warning.
    if (alreadyEncrypted && !u.phoneHash) {
      console.warn(`user ${u.id}: phone encrypted but no hash — cannot backfill index`);
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { phone: encryptFieldIfPlain(u.phone), phoneHash: blindIndex(u.phone) },
    });
    users++;
  }

  // Count of what was newly encrypted, not the table size — so a re-run reports 0/0.
  console.log(`encrypted: ${clinics} clinic row(s), ${messages} message(s), ${users} user phone(s)`);
  await prisma.$disconnect();
}

void main().catch(async (e) => {
  console.error("backfill failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
