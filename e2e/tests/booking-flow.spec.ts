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

  // The three lifecycle steps were logged in order.
  const steps = page.getByTestId("steps").locator("li");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText("Offer created");
  await expect(steps.nth(1)).toContainText("accepted");
  await expect(steps.nth(2)).toContainText("Booking confirmed");
});
