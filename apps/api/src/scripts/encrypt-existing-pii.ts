import "../env.js"; // load DATABASE_URL + FIELD_ENCRYPTION_KEY before @probook/db
import { prisma } from "@probook/db";
import { encryptField } from "../modules/marketplace/field-crypto.js";

/**
 * One-off backfill: encrypt PII columns written before field encryption existed.
 *
 * New writes are encrypted at the store boundary, and reads tolerate legacy plaintext — so
 * the app is correct without this. But "encrypted at rest" is not true of a table full of
 * plaintext rows, so this rewrites them. `encryptField` no-ops on an already-encrypted
 * value, making the script safe to re-run and safe to interrupt.
 *
 *   node apps/api/dist/scripts/encrypt-existing-pii.js
 */
async function main() {
  let clinics = 0;
  for (const c of await prisma.clinicWorkspace.findMany({ select: { id: true, licenceNo: true, address: true } })) {
    const licenceNo = encryptField(c.licenceNo);
    const address = encryptField(c.address);
    if (licenceNo === c.licenceNo && address === c.address) continue; // already encrypted
    await prisma.clinicWorkspace.update({ where: { id: c.id }, data: { licenceNo, address } });
    clinics++;
  }

  let messages = 0;
  for (const m of await prisma.message.findMany({ select: { id: true, body: true } })) {
    const body = encryptField(m.body);
    if (body === m.body) continue;
    await prisma.message.update({ where: { id: m.id }, data: { body } });
    messages++;
  }

  // Count of what was newly encrypted, not the table size — so a re-run reports 0/0.
  console.log(`encrypted: ${clinics} clinic row(s), ${messages} message(s)`);
  await prisma.$disconnect();
}

void main().catch(async (e) => {
  console.error("backfill failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
