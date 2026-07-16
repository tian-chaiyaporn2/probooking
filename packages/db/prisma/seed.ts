/**
 * Phase 0 seed — a minimal, controlled fixture set so the concierge flow can be
 * exercised end to end (one clinic branch, one professional, one draft shift).
 * Extend as BDD scenarios (features/) need more fixtures.
 */
import { prisma } from "../src/index.js";

async function main() {
  console.log("Seeding ProBooking Phase 0 fixtures…");
  // Intentionally left as a stub: wire up once the first migration exists.
  // Example shape (uncomment after `pnpm db:migrate`):
  //
  // const clinicOwner = await prisma.user.create({ data: { phone: "+66900000001" } });
  // const workspace = await prisma.clinicWorkspace.create({
  //   data: { branchName: "Demo Clinic — Sukhumvit", licenceNo: "TH-DEMO-001", address: "Bangkok" },
  // });
  // await prisma.membership.create({
  //   data: { userId: clinicOwner.id, workspaceId: workspace.id, role: "clinic_owner" },
  // });
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
