import { test, expect } from "@playwright/test";

/**
 * Log in as an ordinary party (clinic owner / professional) and return an auth header.
 * Authority is derived from the caller's identity, so tests must act as the real party
 * rather than posting party ids anonymously.
 */
async function loginAs(request: any, api: string, phone: string) {
  const req = await request.post(`${api}/auth/otp/request`, { data: { phone } });
  const { devCode } = (await req.json()) as { devCode: string };
  const ver = await request.post(`${api}/auth/otp/verify`, { data: { phone, code: devCode } });
  const { token } = (await ver.json()) as { token: string };
  return { authorization: `Bearer ${token}` };
}

/** Sign in through the dashboards' staff OTP form. Under AUTH_DEV_MODE the code is echoed
 * back, so filling the phone and clicking send completes the login in one step. The form is
 * Thai (staffLogin strings), so the selectors match that copy. */
async function staffUiLogin(page: any, phone: string) {
  await page.getByLabel("หมายเลขโทรศัพท์ของเจ้าหน้าที่").fill(phone);
  await page.getByRole("button", { name: "ส่งรหัส OTP" }).click();
}

/**
 * Phase 0 vertical-slice e2e. Verifies the browser can drive the marketplace flow
 * against the live API: create offer -> accept -> confirm -> Confirmed booking,
 * with the 12% service fee reflected in the checkout total (10,000 THB comp +
 * 1,200 THB fee = ฿11,200.00).
 */
test("home links to the flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ProBooking" })).toBeVisible(); // brand in the app header
  await page.getByTestId("flow-link").click();
  await expect(page).toHaveURL(/\/flow$/);
});

test("pages are responsive — no horizontal page overflow on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 }); // small phone
  for (const path of ["/", "/flow", "/ops", "/finance"]) {
    await page.goto(path);
    // /ops and /finance now open on a staff sign-in form; sign in, then wait for the
    // data-driven dashboard to settle so the overflow check runs against real content.
    if (path === "/ops") {
      await staffUiLogin(page, "+66900000009");
      await expect(page.getByTestId("refresh")).toBeVisible();
    }
    if (path === "/finance") {
      await staffUiLogin(page, "+66900000004");
      await expect(page.getByTestId("fin-summary")).toBeVisible();
    }
    // The page itself must not scroll horizontally (wide tables scroll inside their box).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});

test("mobile nav collapses into a drawer that opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // The desktop nav is hidden; a menu button stands in for it.
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toBeHidden();
  await page.getByLabel("เปิดเมนู").click();
  // Drawer is open; its links are now visible and Escape dismisses it.
  const drawer = page.getByRole("navigation", { name: "เมนูหลัก" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "เดโม" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByLabel("เปิดเมนู")).toBeVisible();
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
  await staffUiLogin(page, "+66900000005"); // finance staff
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
  await staffUiLogin(page, "+66900000008"); // operations staff
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

  const clinicAuth = await loginAs(page.request, api, `+66sc${uniq}`);
  const proAuth = await loginAs(page.request, api, `+66sp${uniq}`);
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 },
    headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: proAuth,
  });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: proAuth });

  // Ops suspends the licence AFTER acceptance — confirm must now be rejected (§6.3).
  await page.request.post(`${api}/ops/professionals/${pro.id}/suspend-credential`, { headers: auth });
  const confirm = await page.request.post(`${api}/offers/${offer.id}/confirm`, { headers: clinicAuth });
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
  const clinicAuth = await loginAs(page.request, api, `+66rr${uniq}`);
  const proAuth = await loginAs(page.request, api, `+66rq${uniq}`);
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: proAuth,
  });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: proAuth });
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, { headers: clinicAuth }));
  const bookingId = confirmed.booking.id;
  await page.request.post(`${api}/bookings/${bookingId}/complete`, { headers: proAuth });

  // Releasing the payout is authenticated (it moves money): an anonymous caller is refused.
  expect((await page.request.post(`${api}/bookings/${bookingId}/accept-completion`)).status()).toBe(401);
  expect(
    (await page.request.post(`${api}/bookings/${bookingId}/accept-completion`, { headers: opsAuth })).ok(),
  ).toBe(true);

  // REP-01: history + receipt are internal-guarded (they expose money by id); unauth 401.
  expect((await page.request.get(`${api}/bookings/${bookingId}/receipt`)).status()).toBe(401);
  const history = await j(
    await page.request.get(`${api}/professionals/${pro.id}/bookings`, { headers: finAuth }),
  );
  expect(history.bookings.some((b: any) => b.bookingId === bookingId && b.total === 1_120_000)).toBe(true);
  const receipt = await j(await page.request.get(`${api}/bookings/${bookingId}/receipt`, { headers: finAuth }));
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

test("OTP verify is single-use and locks out after repeated wrong codes (AUTH-01)", async ({ page }) => {
  const api = "http://localhost:4000";
  const phone = `+66otp${Date.now()}`;
  const req = await page.request.post(`${api}/auth/otp/request`, { data: { phone } });
  expect(req.status()).toBe(201);
  const { devCode } = (await req.json()) as { devCode: string };

  // Five wrong attempts burn the code (brute-force guard); the correct code then fails.
  for (let i = 0; i < 5; i++) {
    const wrong = await page.request.post(`${api}/auth/otp/verify`, { data: { phone, code: "000000" } });
    expect(wrong.status()).toBe(401);
  }
  const afterLockout = await page.request.post(`${api}/auth/otp/verify`, { data: { phone, code: devCode } });
  expect(afterLockout.status()).toBe(401);
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
  const clinicAuth = await loginAs(page.request, api, `+66sf${uniq}`);
  const proAuth = await loginAs(page.request, api, `+66se${uniq}`);
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: proAuth,
  });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: proAuth });
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, { headers: clinicAuth }));
  const bookingId = confirmed.booking.id;
  expect(
    (await page.request.post(`${api}/bookings/${bookingId}/messages`, {
      data: { body: "See you Tuesday" }, headers: clinicAuth,
    })).status(),
  ).toBe(201);
  expect(
    (await page.request.post(`${api}/bookings/${bookingId}/messages`, {
      data: { body: "patient 1234567890123 details attached" }, headers: clinicAuth,
    })).status(),
  ).toBe(400);

  // A stranger is neither party: they cannot read the thread or harvest contact details.
  const stranger = await loginAs(page.request, api, `+66zz${uniq}`);
  expect((await page.request.get(`${api}/bookings/${bookingId}/messages`, { headers: stranger })).status()).toBe(403);
  expect((await page.request.get(`${api}/bookings/${bookingId}/contact`, { headers: stranger })).status()).toBe(403);
  expect((await page.request.get(`${api}/bookings/${bookingId}/contact`)).status()).toBe(401);
  expect((await page.request.get(`${api}/bookings/${bookingId}/contact`, { headers: clinicAuth })).ok()).toBe(true);
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

/**
 * Regression guards for the auth bypasses found in review. Each of these was a live,
 * unauthenticated path to money or admin; they are cheap to re-open by accident, so each
 * one gets a test that fails loudly rather than a comment asking people to be careful.
 */
test("the money lifecycle cannot be driven anonymously (authz regression guard)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };

  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Az ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66az${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Az", profession: "physician", phone: `+66ay${uniq}`, payoutRef: "x-1" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });
  const clinicAuth = await loginAs(page.request, api, `+66az${uniq}`);
  const proAuth = await loginAs(page.request, api, `+66ay${uniq}`);

  // Posting a shift for someone else's workspace, or with no identity at all, is refused.
  expect((await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 },
  })).status()).toBe(401);
  expect((await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: proAuth,
  })).status()).toBe(403);

  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: clinicAuth,
  }));

  // A professional applies as themselves; enrolling someone else is refused.
  expect((await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  })).status()).toBe(403);
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: proAuth,
  });

  // OFF-01: sending a binding offer requires clinic authority, not a body field.
  expect((await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id, actorRole: "clinic_owner" }, headers: proAuth,
  })).status()).toBe(403);
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  }));

  // Only the professional the offer was made to may accept it.
  const stranger = await loginAs(page.request, api, `+66ax${uniq}`);
  expect((await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: stranger })).status()).toBe(403);
  expect((await page.request.post(`${api}/offers/${offer.id}/accept`)).status()).toBe(401);
  await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: proAuth });

  // Confirming no longer takes the caller's word that it paid: `prefundingSucceeded` is
  // ignored, and the API establishes the capture itself.
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, {
    data: { prefundingSucceeded: false }, headers: clinicAuth,
  }));
  expect(confirmed.booking.state).toBe("Confirmed");
  const bookingId = confirmed.booking.id;

  // Releasing the payout requires authority. Anonymous and non-parties are refused.
  await page.request.post(`${api}/bookings/${bookingId}/complete`, { headers: proAuth });
  expect((await page.request.post(`${api}/bookings/${bookingId}/accept-completion`)).status()).toBe(401);
  expect((await page.request.post(`${api}/bookings/${bookingId}/accept-completion`, { headers: stranger })).status()).toBe(403);
  expect((await page.request.post(`${api}/bookings/${bookingId}/flag-inactive`)).status()).toBe(401);
});

test("OFF-02 is enforced by the database, not only by a read (OFF-02 regression guard)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };

  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Off ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66of${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const mk = async (tag: string) => {
    const p = await j(await page.request.post(`${api}/professionals`, {
      data: { displayName: `Dr ${tag}`, profession: "physician", phone: `+66${tag}${uniq}`, payoutRef: "x" },
    }));
    await page.request.post(`${api}/ops/professionals/${p.id}/verify`, { headers: opsAuth });
    return { ...p, auth: await loginAs(page.request, api, `+66${tag}${uniq}`) };
  };
  const clinicAuth = await loginAs(page.request, api, `+66of${uniq}`);
  const a = await mk("oa");
  const b = await mk("ob");
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: a.id }, headers: a.auth,
  });
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: b.id }, headers: b.auth,
  });

  // One binding offer per shift: the second is refused, whichever professional it targets.
  expect((await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: a.id }, headers: clinicAuth,
  })).ok()).toBe(true);
  const second = await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: b.id }, headers: clinicAuth,
  });
  expect([400, 409]).toContain(second.status());
});

test("§6.4: a refund needs two different authorized people (dual-control guard)", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };

  // Two DISTINCT finance people, via the real OTP + access list (STAFF_PHONES). The
  // dev-token endpoint mints one identity per role (sub = "dev:finance"), which cannot
  // express "a different finance person" — the whole point of §6.4.
  const fin1Auth = await loginAs(page.request, api, "+66900000001");
  const fin2Auth = await loginAs(page.request, api, "+66900000002");

  // Build a confirmed booking with captured funds.
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Dc ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66dc${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Dc", profession: "physician", phone: `+66dp${uniq}`, payoutRef: "x" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });
  const clinicAuth = await loginAs(page.request, api, `+66dc${uniq}`);
  const proAuth = await loginAs(page.request, api, `+66dp${uniq}`);
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: proAuth,
  });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: proAuth });
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, { headers: clinicAuth }));
  const bookingId = confirmed.booking.id;

  // Proposing a refund is finance-only, and moves no money by itself.
  expect((await page.request.post(`${api}/finance/refunds`, {
    data: { bookingId, amount: 50_000, reason: "goodwill" }, headers: clinicAuth,
  })).status()).toBe(403);
  const approval = await j(await page.request.post(`${api}/finance/refunds`, {
    data: { bookingId, amount: 50_000, reason: "goodwill" }, headers: fin1Auth,
  }));
  expect(approval.state).toBe("Pending");

  // PAY-08 still binds at proposal: a refund beyond the captured funds is refused outright.
  expect((await page.request.post(`${api}/finance/refunds`, {
    data: { bookingId, amount: 99_999_999, reason: "too much" }, headers: fin1Auth,
  })).status()).toBe(500); // conservation/allocation guard throws before anything is written

  // §6.4: the initiator cannot approve their own request.
  const self = await page.request.post(`${api}/finance/refunds/${approval.id}/approve`, { headers: fin1Auth });
  expect(self.status()).toBe(403);
  expect(await self.text()).toContain("different authorized person");

  // Nor can an unauthorized second pair of hands (a clinic owner is "different", not authorized).
  expect((await page.request.post(`${api}/finance/refunds/${approval.id}/approve`, {
    headers: clinicAuth,
  })).status()).toBe(403);

  // An administrator is a different person but does NOT hold finance.execute_refund
  // (§3 separation of duties), so they are not a valid approver either.
  const adminAuth = await loginAs(page.request, api, "+66900000003");
  expect((await page.request.post(`${api}/finance/refunds/${approval.id}/approve`, {
    headers: adminAuth,
  })).status()).toBe(403);

  // A different AUTHORIZED finance person executes it exactly once.
  const done = await j(await page.request.post(`${api}/finance/refunds/${approval.id}/approve`, { headers: fin2Auth }));
  expect(done.state).toBe("Executed");
  expect(done.refund).toBe(50_000);

  // Replaying the approval does not refund twice.
  expect((await page.request.post(`${api}/finance/refunds/${approval.id}/approve`, { headers: fin2Auth })).status()).toBe(409);
});

test("§7.3: logout revokes a token, and revoke-sessions kills a subject's tokens", async ({ page }) => {
  const api = "http://localhost:4000";
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;

  // A finance staff token can read the reconciliation.
  const finAuth = await loginAs(page.request, api, "+66900000010");
  expect((await page.request.get(`${api}/finance/reconciliation`, { headers: finAuth })).ok()).toBe(true);

  // After logout, the very same token is refused (401), even though it has not expired.
  expect((await page.request.post(`${api}/auth/logout`, { headers: finAuth })).ok()).toBe(true);
  expect((await page.request.get(`${api}/finance/reconciliation`, { headers: finAuth })).status()).toBe(401);

  // Admin can log a subject out everywhere. A fresh finance login, then admin revokes it.
  const finAuth2 = await loginAs(page.request, api, "+66900000011");
  expect((await page.request.get(`${api}/finance/reconciliation`, { headers: finAuth2 })).ok()).toBe(true);
  const admAuth = await loginAs(page.request, api, "+66900000012");
  expect(
    (await page.request.post(`${api}/auth/sessions/revoke`, {
      data: { subject: "+66900000011" },
      headers: admAuth,
    })).ok(),
  ).toBe(true);
  // The finance token issued before the revoke is now rejected.
  expect((await page.request.get(`${api}/finance/reconciliation`, { headers: finAuth2 })).status()).toBe(401);
  // A non-admin cannot revoke sessions.
  const finAuth3 = await loginAs(page.request, api, "+66900000013");
  expect(
    (await page.request.post(`${api}/auth/sessions/revoke`, {
      data: { subject: "+66900000010" },
      headers: finAuth3,
    })).status(),
  ).toBe(403);

  // §3: suspending a staff phone denies their existing token immediately AND drops them to
  // an ordinary user on re-login — no restart. (Uses +66900000014, not reused elsewhere.)
  const victimAuth = await loginAs(page.request, api, "+66900000014");
  expect((await page.request.get(`${api}/finance/reconciliation`, { headers: victimAuth })).ok()).toBe(true);
  expect(
    (await page.request.post(`${api}/auth/staff/suspend`, {
      data: { phone: "+66900000014" },
      headers: admAuth,
    })).ok(),
  ).toBe(true);
  // The suspended staff's existing token is refused on its next request. (That a re-login
  // then resolves to an ordinary user is asserted in the StaffDirectory unit test, which
  // does not fight the per-phone OTP interval.)
  expect((await page.request.get(`${api}/finance/reconciliation`, { headers: victimAuth })).status()).toBe(401);
});
