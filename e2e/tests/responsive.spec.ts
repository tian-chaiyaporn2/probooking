import { test, expect } from "@playwright/test";

test("pages are responsive — no horizontal page overflow on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ["/", "/flow", "/ops", "/finance"]) {
    await page.goto(path);
    if (path === "/finance") await expect(page.getByTestId("fin-summary")).toBeVisible();
    if (path === "/ops") await expect(page.getByTestId("refresh")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});

test("mobile nav opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const toggle = page.getByRole("button", { name: "เปิดเมนู" });
  await expect(toggle).toBeVisible();
  await expect(nav.getByRole("link", { name: "ปฏิบัติการ" })).not.toBeVisible();
  await toggle.click();
  await expect(page.getByRole("button", { name: "ปิดเมนู" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "ปฏิบัติการ" })).toBeVisible();
  await nav.getByRole("link", { name: "การเงิน" }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await expect(page.getByRole("button", { name: "เปิดเมนู" })).toBeVisible();
});

test("finance shows card layout on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/finance");
  await expect(page.getByTestId("reconciliation-rows-cards")).toBeVisible();
  await expect(page.locator(".data-table-desktop")).toBeHidden();
});

test("skip link focuses main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "ข้ามไปยังเนื้อหาหลัก" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
