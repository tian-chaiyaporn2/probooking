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
 * Land on a role's surface exactly as the "sign in as" picker does: navigate, write the
 * session the picker would have stored, and reload so the page hydrates from it. Uses a
 * token minted once (avoids the per-phone OTP interval that re-login would hit).
 */
async function injectSession(page: any, route: string, token: string, phone: string) {
  await page.goto(route);
  await page.evaluate(
    ([t, p]: [string, string]) => sessionStorage.setItem("probook.session", JSON.stringify({ token: t, phone: p })),
    [token, phone],
  );
  await page.reload();
}

/**
 * Drive the API to a Confirmed booking with captured funds (the state the ops credential
 * hold and the finance refund both need). Returns the booking id plus an operations auth
 * header for follow-up staff actions.
 */
async function provisionConfirmedBooking(page: any, api: string, uniq: string) {
  const j = async (r: any) => (await r.json()) as any;
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Wk ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66wc${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Wk", profession: "physician", phone: `+66wp${uniq}`, payoutRef: "x" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });
  const clinicAuth = await loginAs(page.request, api, `+66wc${uniq}`);
  const proAuth = await loginAs(page.request, api, `+66wp${uniq}`);
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 1_000_000 }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, { data: { professionalId: pro.id }, headers: proAuth });
  const offer = await j(await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/offers/${offer.id}/accept`, { headers: proAuth });
  const confirmed = await j(await page.request.post(`${api}/offers/${offer.id}/confirm`, { headers: clinicAuth }));
  return { bookingId: confirmed.booking.id as string, clinicId: clinic.id as string, proId: pro.id as string, opsAuth };
}

/**
 * Phase 0 vertical-slice e2e. Verifies the browser can drive the marketplace flow
 * against the live API: create offer -> accept -> confirm -> Confirmed booking,
 * with the 12% service fee reflected in the checkout total (10,000 THB comp +
 * 1,200 THB fee = ฿11,200.00).
 */
test("readiness health reports the store and returns 200 (M9)", async ({ page }) => {
  const res = await page.request.get("http://localhost:4000/health/ready");
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { status: string; store: string };
  expect(body.status).toBe("ready");
  expect(["in-memory", "postgres"]).toContain(body.store); // memory leg vs postgres leg
});

test("home links to the flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ProBooking" })).toBeVisible(); // brand in the app header
  await page.getByTestId("flow-link").click();
  await expect(page).toHaveURL(/\/flow$/);
});

test("pages are responsive — no horizontal page overflow on phone and tablet", async ({ page }) => {
  const viewports = [
    { width: 360, height: 740 }, // small phone
    { width: 390, height: 844 }, // common phone
    { width: 768, height: 1024 }, // tablet portrait
    { width: 834, height: 1194 }, // large tablet portrait
  ];
  // Public paths: check every viewport without auth.
  for (const path of ["/", "/signin", "/journey", "/flow"]) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `horizontal overflow on ${path} at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(1);
    }
  }
  // Staff dashboards: sign in once per surface, then resize (avoids OTP interval collisions).
  for (const { path, phone, ready } of [
    { path: "/ops", phone: "+66900000009", ready: "refresh" },
    { path: "/finance", phone: "+66900000004", ready: "fin-summary" },
  ]) {
    await page.setViewportSize(viewports[0]!);
    await page.goto("/");
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(path);
    await staffUiLogin(page, phone);
    await expect(page.getByTestId(ready)).toBeVisible();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `horizontal overflow on ${path} at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test("mobile and tablet nav collapses into a drawer that opens and closes", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 }, // below 960px drawer breakpoint
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    // The desktop nav is hidden; a menu button stands in for it.
    await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toBeHidden();
    await page.getByLabel("เปิดเมนู").click();
    // Drawer opens as a labelled dialog; signed-out users see public links only (no staff/flow).
    const drawer = page.getByRole("dialog", { name: "เมนูหลัก" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "เข้าใช้งาน" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "ทดสอบระบบ" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.getByLabel("เปิดเมนู")).toBeVisible();
  }
});

test("landing hero exposes demo and how-it-works CTAs with trust line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("hero-cta-primary")).toHaveText("เริ่มเดโม");
  await expect(page.getByTestId("hero-cta-secondary")).toHaveText("ดูวิธีทำงาน");
  await expect(page.getByTestId("trust-line")).toBeVisible();
  await expect(page.getByText("กรุงเทพฯ และปริมณฑล · แพทย์และทันตแพทย์")).toBeVisible();
  await page.getByTestId("hero-cta-primary").click();
  await expect(page).toHaveURL(/#start$/);
});

test("landing contact block captures real-interest clinics", async ({ page }) => {
  await page.goto("/");
  const contact = page.getByTestId("contact-block");
  await expect(contact).toBeVisible();
  await expect(page.getByTestId("contact-cta")).toHaveText("ติดต่อทีมคอนเซียร์จ");
  await expect(page.getByTestId("contact-cta")).toHaveAttribute(
    "href",
    "mailto:concierge@probooking.app",
  );
});

test("how-it-works toggles clinic and professional perspectives", async ({ page }) => {
  await page.goto("/#how");
  await expect(page.getByTestId("how-steps")).toContainText("ประกาศเวร");
  await page.getByTestId("how-pro").click();
  await expect(page.getByTestId("how-steps")).toContainText("ยืนยันตัวตน");
  await page.getByTestId("how-clinic").click();
  await expect(page.getByTestId("how-steps")).toContainText("ประกาศเวร");
});

test("signed-in clinic nav hides staff links and supports sign out", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.evaluate(() => sessionStorage.clear());
  await page.locator("#start").scrollIntoViewIfNeeded();
  await page.getByTestId("signin-clinic").click();
  await expect(page).toHaveURL(/\/clinic$/);
  await expect(page.getByRole("link", { name: "ปฏิบัติการ" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "การเงิน" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "คลินิกของฉัน" })).toBeVisible();
  await page.getByTestId("nav-signout").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator(".app-nav--desktop").getByRole("link", { name: "เข้าใช้งาน" }),
  ).toBeVisible();
});

test("landing keeps brand before product visual on phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const order = await page.evaluate(() => {
    const brand = document.querySelector(".hero__brand");
    const visual = document.querySelector(".hero__visual");
    if (!brand || !visual) return null;
    const position = brand.compareDocumentPosition(visual);
    return {
      brandFirst: !!(position & Node.DOCUMENT_POSITION_FOLLOWING),
      brandTop: brand.getBoundingClientRect().top,
      visualTop: visual.getBoundingClientRect().top,
    };
  });
  expect(order).not.toBeNull();
  expect(order!.brandFirst).toBe(true);
  expect(order!.brandTop).toBeLessThan(order!.visualTop);
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
  await page.getByTestId("dialog-confirm").click();
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
  })).status()).toBe(400); // PAY-08 refuses before anything is written (client error, not 500)

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

test("interactive multi-role flow: clinic and professional drive a booking by hand", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: Awaited<ReturnType<typeof page.request.get>>) => (await r.json()) as any;
  const money = "฿13,579.00";
  const total = "฿15,208.48"; // 13,579 + 12% fee

  // Provision a verified clinic + professional (the party pages need real, verified parties).
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Play ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66pc${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Play", profession: "physician", phone: `+66pp${uniq}`, payoutRef: "x" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });

  // Log each party in ONCE and reuse the token; re-logging-in the same phone each turn would
  // trip the per-phone OTP interval. "Signing in" then just injects the session the picker
  // would have stored and lands on the dashboard — the real page under test.
  const clinicToken = (await loginAs(page.request, api, `+66pc${uniq}`)).authorization.slice("Bearer ".length);
  const proToken = (await loginAs(page.request, api, `+66pp${uniq}`)).authorization.slice("Bearer ".length);
  const actAs = async (who: "clinic" | "pro", route: string) => {
    const token = who === "clinic" ? clinicToken : proToken;
    const phone = who === "clinic" ? `+66pc${uniq}` : `+66pp${uniq}`;
    await page.goto(route);
    await page.evaluate(
      ([t, p]) => sessionStorage.setItem("probook.session", JSON.stringify({ token: t, phone: p })),
      [token, phone],
    );
    await page.reload();
  };

  // 1. Clinic posts a shift.
  await actAs("clinic", "/clinic");
  await page.getByTestId("shift-comp").fill("13579");
  // Urgent so the shift sorts to the top of the professional's browse (which shows the
  // first 25, urgent-first) regardless of how many other open shifts exist.
  await page.getByRole("checkbox").check();
  await page.getByTestId("post-shift").click();
  await expect(page.getByTestId("clinic-shifts").locator("li", { hasText: money }).first()).toBeVisible();

  // 2. Professional applies.
  await actAs("pro", "/pro");
  await page.getByTestId("open-shifts").locator("li", { hasText: money }).first().getByTestId("apply-shift").click();
  await expect(page.getByTestId("pro-bookings")).toBeVisible();

  // 3. Clinic sends the offer.
  await actAs("clinic", "/clinic");
  const shiftRow = page.getByTestId("clinic-shifts").locator("li", { hasText: money }).first();
  await expect(shiftRow.getByTestId("send-offer").first()).toBeVisible();
  await shiftRow.getByTestId("send-offer").first().click();

  // 4. Professional accepts.
  await actAs("pro", "/pro");
  const offerRow = page.getByTestId("pro-offers").locator("li", { hasText: money }).first();
  await expect(offerRow.getByTestId("accept-offer")).toBeVisible();
  await offerRow.getByTestId("accept-offer").click();

  // 5. Clinic confirms & pays.
  await actAs("clinic", "/clinic");
  const shiftRow2 = page.getByTestId("clinic-shifts").locator("li", { hasText: money }).first();
  await expect(shiftRow2.getByTestId("confirm-offer")).toBeVisible();
  await shiftRow2.getByTestId("confirm-offer").click();
  await expect(page.getByTestId("clinic-bookings").locator("li", { hasText: total }).first()).toBeVisible();

  // 6. Professional completes.
  await actAs("pro", "/pro");
  const bk = page.getByTestId("pro-bookings").locator("li", { hasText: total }).first();
  await expect(bk.getByTestId("complete")).toBeVisible();
  await bk.getByTestId("complete").click();

  // 7. Clinic accepts completion → the booking reaches ServiceCompleted (payout).
  await actAs("clinic", "/clinic");
  const bk2 = page.getByTestId("clinic-bookings").locator("li", { hasText: total }).first();
  await expect(bk2.getByTestId("accept-completion")).toBeVisible();
  await bk2.getByTestId("accept-completion").click();
  // The booking-state badge is localized (statusLabel); ServiceCompleted → "เสร็จงานแล้ว".
  await expect(page.getByTestId("clinic-bookings").locator("li", { hasText: "เสร็จงานแล้ว" }).first()).toBeVisible();
});

test("operations walkthrough: verify pending parties and resolve a credential hold by hand", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: any) => (await r.json()) as any;

  // A confirmed booking placed on a credential hold (VER-06) → an open case waits for ops.
  const { bookingId, opsAuth } = await provisionConfirmedBooking(page, api, `oh${uniq}`);
  await page.request.post(`${api}/bookings/${bookingId}/hold-credential`, { headers: opsAuth });

  // Two UNVERIFIED parties waiting in the verification queue.
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Pend ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66oc${uniq}` },
  }));
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Pend", profession: "physician", phone: `+66op${uniq}`, payoutRef: "x" },
  }));

  // Sign in as operations exactly as the picker would (dedicated phone, no OTP-interval clash).
  const opsToken = (await loginAs(page.request, api, "+66900000020")).authorization.slice("Bearer ".length);
  await injectSession(page, "/ops", opsToken, "+66900000020");
  await expect(page.getByTestId("ops-metrics")).toBeVisible();

  // Verify the pending clinic through the console.
  await expect(page.getByTestId(`pending-${clinic.id}`)).toBeVisible();
  await page.getByTestId(`pending-${clinic.id}`).getByTestId("verify-btn").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId(`pending-${clinic.id}`)).toHaveCount(0);

  // Verify the pending professional through the console.
  await expect(page.getByTestId(`pending-${pro.id}`)).toBeVisible();
  await page.getByTestId(`pending-${pro.id}`).getByTestId("verify-btn").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId(`pending-${pro.id}`)).toHaveCount(0);

  // Resolve the credential hold from the open-cases list.
  const caseRow = page.getByTestId("cases-list").locator("li", { hasText: bookingId.slice(0, 8) }).first();
  await expect(caseRow.getByTestId("resolve-btn")).toBeVisible();
  await caseRow.getByTestId("resolve-btn").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("cases-list").locator("li", { hasText: bookingId.slice(0, 8) })).toHaveCount(0);
});

test("operations enforcement walkthrough: verify insurance, hold a booking, suspend a licence", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;

  // A confirmed booking (its professional is verified) plus submitted insurance evidence
  // waiting for review. Staff may submit on the professional's behalf (requireProfessional).
  const { bookingId, proId, opsAuth } = await provisionConfirmedBooking(page, api, `en${uniq}`);
  await page.request.post(`${api}/professionals/${proId}/insurance`, {
    data: { validUntilHours: 8760 }, headers: opsAuth,
  });

  // A dedicated ops phone (distinct from the other ops walkthrough) so the two never land
  // within the per-phone OTP interval of each other.
  const opsToken = (await loginAs(page.request, api, "+66900000023")).authorization.slice("Bearer ".length);
  await injectSession(page, "/ops", opsToken, "+66900000023");

  // 1. Verify the submitted insurance from the verification queue (kind = insurance).
  await expect(page.getByTestId(`pending-${proId}`)).toBeVisible();
  await page.getByTestId(`pending-${proId}`).getByTestId("verify-btn").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId(`pending-${proId}`)).toHaveCount(0);

  // 2. Place a credential hold on the live booking from the active-bookings section.
  const row = page.getByTestId(`active-${bookingId}`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("hold-btn")).toBeVisible();
  await row.getByTestId("hold-btn").click();
  await page.getByTestId("dialog-confirm").click();
  // The hold action is gone (already held) and a credential-hold case now exists.
  await expect(page.getByTestId(`active-${bookingId}`).locator("[data-testid=hold-btn]")).toHaveCount(0);
  await expect(page.getByTestId("cases-list").locator("li", { hasText: bookingId.slice(0, 8) }).first()).toBeVisible();

  // 3. Suspend the professional's licence (VER-04) from the same row.
  await expect(page.getByTestId(`active-${bookingId}`).getByTestId("suspend-btn")).toBeVisible();
  await page.getByTestId(`active-${bookingId}`).getByTestId("suspend-btn").click();
  await page.getByTestId("dialog-confirm").click();
  // Suspended: the action is gone and the row shows the suspended badge.
  await expect(page.getByTestId(`active-${bookingId}`).locator("[data-testid=suspend-btn]")).toHaveCount(0);
  await expect(page.getByTestId(`active-${bookingId}`).getByText("ระงับแล้ว")).toBeVisible();
});

test("finance walkthrough: reconcile, export, and run a dual-control refund by hand", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;

  // A confirmed booking → its payment order captured funds and sorts newest-first in recon.
  await provisionConfirmedBooking(page, api, `fr${uniq}`);

  // Finance proposer signs in (dedicated phone), reconciliation + summary render.
  const proposerToken = (await loginAs(page.request, api, "+66900000021")).authorization.slice("Bearer ".length);
  await injectSession(page, "/finance", proposerToken, "+66900000021");
  await expect(page.getByTestId("fin-summary")).toBeVisible();
  await expect(page.getByTestId("fin-exceptions")).toHaveText(/^0$/);

  // Export the CSV (REP-02) — assert the download is produced.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-csv").click(),
  ]);
  expect(await download.suggestedFilename()).toBe("finance-export.csv");

  // Propose a ฿123 refund on the newest (top) reconciliation row.
  await page.getByTestId("reconciliation-rows").locator("[data-testid=refund-btn]").first().click();
  await expect(page.getByTestId("refund-form")).toBeVisible();
  await page.getByTestId("refund-amount").fill("123.45"); // satang precision (fix)
  await page.getByTestId("refund-reason").fill("goodwill (walkthrough)");
  await page.getByTestId("refund-submit").click();

  // The proposal is now awaiting a second person. The proposer cannot approve their own
  // (§6.4): the API rejects it, so the approval stays pending rather than executing.
  const approvalRow = page.getByTestId("approvals-list").locator("li", { hasText: "฿123.45" }).first();
  await expect(approvalRow).toBeVisible();
  await approvalRow.getByTestId("approve-btn").click();
  await expect(page.getByTestId("approvals-list").locator("li", { hasText: "฿123.45" })).toHaveCount(1);

  // A DIFFERENT finance person approves it — the refund executes and leaves recon conserved.
  const approverToken = (await loginAs(page.request, api, "+66900000022")).authorization.slice("Bearer ".length);
  await injectSession(page, "/finance", approverToken, "+66900000022");
  const row2 = page.getByTestId("approvals-list").locator("li", { hasText: "฿123.45" }).first();
  await expect(row2.getByTestId("approve-btn")).toBeVisible();
  await row2.getByTestId("approve-btn").click();
  await expect(page.getByTestId("fin-exceptions")).toHaveText(/^0$/); // still conserved after the refund
});

test("a professional can decline a pending offer", async ({ page }) => {
  const api = "http://localhost:4000";
  const uniq = `${Date.now()}`;
  const j = async (r: any) => (await r.json()) as any;

  // Verified clinic + professional, an offer made to the professional (PendingResponse).
  const ops = await j(await page.request.post(`${api}/auth/dev/token`, { data: { role: "operations" } }));
  const opsAuth = { authorization: `Bearer ${ops.token}` };
  const clinic = await j(await page.request.post(`${api}/clinics`, {
    data: { branchName: `Dec ${uniq}`, licenceNo: "L", address: "BKK", ownerPhone: `+66xc${uniq}` },
  }));
  await page.request.post(`${api}/ops/clinics/${clinic.id}/verify`, { headers: opsAuth });
  const pro = await j(await page.request.post(`${api}/professionals`, {
    data: { displayName: "Dr Dec", profession: "physician", phone: `+66xp${uniq}`, payoutRef: "x" },
  }));
  await page.request.post(`${api}/ops/professionals/${pro.id}/verify`, { headers: opsAuth });
  const clinicAuth = await loginAs(page.request, api, `+66xc${uniq}`);
  // Log the professional in ONCE and reuse — re-logging the same phone would trip the OTP interval.
  const proAuth = await loginAs(page.request, api, `+66xp${uniq}`);
  const shift = await j(await page.request.post(`${api}/shifts`, {
    data: { clinicWorkspaceId: clinic.id, compensation: 700_000 }, headers: clinicAuth,
  }));
  await page.request.post(`${api}/shifts/${shift.shiftId}/apply`, {
    data: { professionalId: pro.id }, headers: proAuth,
  });
  await page.request.post(`${api}/shifts/${shift.shiftId}/offer`, {
    data: { professionalId: pro.id }, headers: clinicAuth,
  });

  // Sign in as the professional and decline the offer from the dashboard.
  const proToken = proAuth.authorization.slice("Bearer ".length);
  await injectSession(page, "/pro", proToken, `+66xp${uniq}`);
  const offerRow = page.getByTestId("pro-offers").locator("li", { hasText: "฿7,000.00" }).first();
  await expect(offerRow.getByTestId("decline-offer")).toBeVisible();
  await offerRow.getByTestId("decline-offer").click();
  // Once declined the offer is no longer actionable — accept/decline buttons are gone.
  await expect(page.getByTestId("pro-offers").locator("[data-testid=decline-offer]")).toHaveCount(0);
  await expect(page.getByTestId("pro-offers").locator("[data-testid=accept-offer]")).toHaveCount(0);
});

test("the sign-in picker offers an account per role", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByTestId("signin-party-group")).toBeVisible();
  await expect(page.getByTestId("signin-staff-group")).toBeVisible();
  await expect(page.getByTestId("guided-demo")).toBeVisible();
  for (const id of ["clinic", "professional", "operations", "finance", "finance-approver"]) {
    await expect(page.getByTestId(`signin-${id}`)).toBeVisible();
  }
});

test("the home page leads with the role picker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("guided-demo")).toBeVisible();
  await expect(page.getByTestId("contact-block")).toBeVisible();
  // The picker lives in #start — scroll there for below-the-fold phones.
  await page.locator("#start").scrollIntoViewIfNeeded();
  for (const id of ["clinic", "professional", "operations", "finance"]) {
    await expect(page.getByTestId(`signin-${id}`)).toBeVisible();
  }
  // Clicking a card signs in and lands on that role's surface (professional avoids OTP
  // interval collision with the signed-in clinic nav test above).
  await page.getByTestId("signin-professional").click();
  await expect(page).toHaveURL(/\/pro$/);
});

// Placed LAST: on the in-memory demo leg this wipes and re-seeds the shared store, so no
// other test should run after it.
test("demo reset is available in demo mode and gated otherwise", async ({ page }) => {
  const res = await page.request.post("http://localhost:4000/demo/reset");
  // 2xx when the API runs in in-memory demo mode; 403 when it is backed by Postgres.
  expect([200, 201, 403]).toContain(res.status());
  if (res.ok()) expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
});
