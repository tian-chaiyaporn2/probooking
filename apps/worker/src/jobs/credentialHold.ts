import { prisma } from "@probook/db";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000";

export interface CredentialHoldResult {
  due: number;
  held: number;
  failed: number;
}

/**
 * VER-06 sweep. A required licence credential that lapses after confirmation must put
 * the booking on Hold for Operations. Finds active (pre-completion-accepted) bookings
 * that aren't already held whose professional has a non-Verified licence, and triggers
 * the controlled hold-credential action. Idempotent (heldAt-null filter + endpoint guard).
 */
export async function credentialHoldSweep(): Promise<CredentialHoldResult> {
  const due = await prisma.booking.findMany({
    where: {
      state: { in: ["Confirmed", "InProgress", "AwaitingCompletion"] },
      heldAt: null,
      professional: {
        credentials: { some: { kind: "licence", state: { not: "Verified" } } },
      },
    },
    select: { id: true },
  });

  let held = 0;
  let failed = 0;
  for (const booking of due) {
    try {
      const res = await fetch(`${API_BASE}/bookings/${booking.id}/hold-credential`, {
        method: "POST",
      });
      if (res.ok) {
        held++;
      } else {
        failed++;
        console.error(`[credential-hold] ${booking.id} -> HTTP ${res.status}`);
      }
    } catch (e) {
      failed++;
      console.error(`[credential-hold] ${booking.id} failed: ${(e as Error).message}`);
    }
  }
  return { due: due.length, held, failed };
}
