import { test, expect } from "@playwright/test";

/** ST28 — both error boundaries render a friendly page, never a stack trace, and recover. */
test("route error boundary (app/error.tsx)", async ({ page }) => {
  await page.goto("/preview/crash?now=1");
  await expect(page.getByText("Trang chưa hiển thị được")).toBeVisible({ timeout: 20_000 });
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/at \w+ \(|\.tsx:\d+|Error: Lỗi hiển thị/);
  await page.goto("/preview/crash");
  await page.getByRole("button", { name: /Gây lỗi trong trang/ }).click();
  await expect(page.getByText("Trang chưa hiển thị được")).toBeVisible();
});

test("global error boundary (app/global-error.tsx) and recovery", async ({ page }) => {
  await page.goto("/preview/crash");
  await page.getByRole("button", { name: /Gây lỗi toàn ứng dụng/ }).click();
  await expect(page.getByText("Ứng dụng gặp lỗi")).toBeVisible({ timeout: 20_000 });
  expect(await page.locator("body").innerText()).not.toMatch(/\.tsx:\d+|at \w+ \(/);
  await page.getByRole("button", { name: "Thử lại" }).dispatchEvent("click"); // dev overlay may cover the page in `next dev`
  await expect(page.getByText("Ứng dụng gặp lỗi")).toHaveCount(0, { timeout: 20_000 });
});
