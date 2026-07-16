import { test, expect } from "@playwright/test";

/**
 * Phase 0 vertical-slice e2e. Verifies the browser can drive the marketplace flow
 * against the live API: create offer -> accept -> confirm -> Confirmed booking,
 * with the 12% service fee reflected in the checkout total (10,000 THB comp +
 * 1,200 THB fee = ฿11,200.00).
 */
test("home links to the flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ProBooking" })).toBeVisible();
  await page.getByTestId("flow-link").click();
  await expect(page).toHaveURL(/\/flow$/);
});

test("booking flow confirms a booking with the correct checkout total", async ({ page }) => {
  await page.goto("/flow");
  await page.getByTestId("run-flow").click();

  await expect(page.getByTestId("result")).toBeVisible();
  await expect(page.getByTestId("booking-status")).toHaveText("Booking Confirmed");
  await expect(page.getByTestId("checkout-total")).toHaveText("฿11,200.00");
  await expect(page.getByTestId("booking-id")).not.toBeEmpty();

  // Onboarding + verification + discovery + lifecycle steps were logged in order.
  const steps = page.getByTestId("steps").locator("li");
  await expect(steps).toHaveCount(7);
  await expect(steps.nth(0)).toContainText("Registered");
  await expect(steps.nth(1)).toContainText("verified");
  await expect(steps.nth(2)).toContainText("Shift posted");
  await expect(steps.nth(3)).toContainText("applied");
  await expect(steps.nth(4)).toContainText("Offer created");
  await expect(steps.nth(5)).toContainText("accepted");
  await expect(steps.nth(6)).toContainText("Booking confirmed");
});

test("finance reconciliation shows zero exceptions", async ({ page }) => {
  await page.goto("/finance");
  await expect(page.getByTestId("fin-summary")).toBeVisible();
  // Every payment order conserves by construction, so no reconciliation exceptions.
  await expect(page.getByTestId("fin-exceptions")).toHaveText("0");
});

test("ops dashboard verifies a pending clinic", async ({ page }) => {
  const uniq = `${Date.now()}`;
  // Register a clinic (lands in Submitted) directly against the API.
  const res = await page.request.post("http://localhost:4000/clinics", {
    data: { branchName: `Ops Test ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66ops${uniq}` },
  });
  const clinic = await res.json();

  await page.goto("/ops");
  const row = page.getByTestId(`pending-${clinic.id}`);
  await expect(row).toBeVisible();
  await row.getByTestId("verify-btn").click();
  // After verifying, the clinic leaves the pending list.
  await expect(page.getByTestId(`pending-${clinic.id}`)).toHaveCount(0);
});

test("a suspended professional cannot be confirmed (VER-04 gate)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.post>>) => (await r.json()) as any;

  // Operations token for the guarded verify/suspend endpoints.
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const auth = { authorization: `Bearer ${ops.token}` };

  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Susp ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66sc${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: auth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Susp", profession: "physician", phone: `+66sp${uniq}`, payoutRef: "x-1" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: auth });

  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 },
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, { data: { professionalId: pro.id } });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id },
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`);

  // Ops suspends the licence AFTER acceptance — confirm must now be rejected (§6.3).
  await page.request.post(`${api}/ops/professionals/${pro.id}/suspend-credential`, { headers: auth });
  const confirm = await page.request.post(`${api}/offers/${offer.id}/confirm`, {
    data: { prefundingSucceeded: true },
  });
  expect(confirm.status()).toBe(400);
  expect(await confirm.text()).toContain("suspended");
});

test("verified profile separates self-declared claims from verified facts (VER-03)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const auth = { authorization: `Bearer ${ops.token}` };

  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Profile", profession: "dentist", phone: `+66pf${uniq}`, payoutRef: "x-1" },
  }));

  // Before verification: self-declared claims present, nothing verified.
  const before = await j(await page.request.get(`${api}/professionals/${pro.id}/profile`));
  expect(before.selfDeclared.displayName).toBe("Dr Profile");
  expect(before.selfDeclared.profession).toBe("dentist");
  expect(before.verified.identityVerified).toBe(false);

  // After Ops verifies, identity flips to verified but self-declared is unchanged.
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: auth });
  const after = await j(await page.request.get(`${api}/professionals/${pro.id}/profile`));
  expect(after.verified.identityVerified).toBe(true);
  expect(after.verified.licence.state).toBe("Verified");
  expect(after.selfDeclared.profession).toBe("dentist");
});

test("reporting: history, receipt, metrics, and finance CSV export (REP-01..03)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const fin = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "finance" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };
  const finAuth = { authorization: `Bearer ${fin.token}` };

  // Drive one booking to payout so the reports have data.
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Rep ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66rr${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Rep", profession: "physician", phone: `+66rq${uniq}`, payoutRef: "x-1" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 },
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, { data: { professionalId: pro.id } });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id },
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`);
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, {
    data: { prefundingSucceeded: true },
  }));
  const bookingId = confirmed.booking.id;
  await page.request.post(`${api}/bookings/${bookingId}/complete`);
  await page.request.post(`${api}/bookings/${bookingId}/accept-completion`);

  // REP-01: history + receipt reflect the ฿11,200 checkout and the ฿10,000 payout.
  const history = await j(await page.request.get(`${api}/professionals/${pro.id}/bookings`));
  expect(history.bookings.some((b: any) => b.bookingId === bookingId && b.total === 1_120_000)).toBe(true);
  const receipt = await j(await page.request.get(`${api}/bookings/${bookingId}/receipt`));
  expect(receipt.checkout.total).toBe(1_120_000);
  expect(receipt.payout).toEqual({ state: "Paid", amount: 1_000_000 });

  // REP-03: metrics require an ops role; unauth is rejected.
  expect((await page.request.get(`${api}/ops/metrics`)).status()).toBe(401);
  const metrics = await j(await page.request.get(`${api}/ops/metrics`, { headers: opsAuth }));
  expect(metrics.bookings.completed).toBeGreaterThan(0);
  expect(metrics.money.reconciliationExceptions).toBe(0);

  // REP-02: finance CSV export is finance-guarded and contains the ledger.
  expect((await page.request.get(`${api}/finance/export`, { headers: opsAuth })).status()).toBe(403);
  const csvRes = await page.request.get(`${api}/finance/export`, { headers: finAuth });
  expect(csvRes.headers()["content-type"]).toContain("text/csv");
  const csv = await csvRes.text();
  expect(csv.split("\n")[0]).toContain("paymentOrderId");
  expect(csv).toContain("Payout");
});

test("privacy & security: audit trail, OTP rate limit, patient-data guard (§7.3)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const adm = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "administrator" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };
  const admAuth = { authorization: `Bearer ${adm.token}` };

  // A privileged verify must appear in the immutable audit trail.
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Sec", profession: "physician", phone: `+66se${uniq}`, payoutRef: "x-1" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });

  // Audit is administrator-only.
  expect((await page.request.get(`${api}/ops/audit`, { headers: opsAuth })).status()).toBe(403);
  const trail = await j(await page.request.get(`${api}/ops/audit`, { headers: admAuth }));
  const entry = trail.audit.find((a: any) => a.action === "verify_professional" && a.targetId === pro.id);
  expect(entry).toBeTruthy();
  expect(entry.role).toBe("operations");

  // OTP requests are rate limited per phone (second within the window is 429).
  const phone = `+66rl${uniq}`;
  expect((await page.request.post(`${api}/auth/otp/request`, { data: { phone } })).status()).toBe(201);
  expect((await page.request.post(`${api}/auth/otp/request`, { data: { phone } })).status()).toBe(429);

  // Patient identifiers are rejected in messages. Build a confirmed booking first.
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Sec ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66sf${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 },
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, { data: { professionalId: pro.id } });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id },
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`);
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, {
    data: { prefundingSucceeded: true },
  }));
  const bookingId = confirmed.booking.id;
  expect(
    (await page.request.post(`${api}/bookings/${bookingId}/messages`, {
      data: { senderId: clinic.id, body: "See you Tuesday" },
    })).status(),
  ).toBe(201);
  expect(
    (await page.request.post(`${api}/bookings/${bookingId}/messages`, {
      data: { senderId: clinic.id, body: "patient 1234567890123 details attached" },
    })).status(),
  ).toBe(400);
});

test("completion pays out, then both parties review", async ({ page }) => {
  await page.goto("/flow");
  await page.getByTestId("run-flow").click();
  await expect(page.getByTestId("booking-status")).toHaveText("Booking Confirmed");

  await page.getByTestId("run-payout").click();
  await expect(page.getByTestId("payout-status")).toHaveText("Paid out");
  // Professional receives the 10,000 THB compensation (fee stays with the platform).
  await expect(page.getByTestId("payout-amount")).toHaveText("฿10,000.00");

  // Both parties review; the pair publishes (REV-03). Rating stays hidden until 3 (REV-04).
  await page.getByTestId("run-reviews").click();
  await expect(page.getByTestId("reviews-status")).toHaveText("Reviews published");
  await expect(page.getByTestId("rating")).toContainText("needs 3 reviews");
});
