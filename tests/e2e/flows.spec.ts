import { test, expect } from "@playwright/test";
import { asPersona, openParentLink, settle } from "./helpers";

const A = "/classroom/demo-school-a/y-a-2026";

test("F02/Q13 — Cô Lan: full tabs in 10A1, subject-only in 10A2; direct URL to 10A2 seating is denied", async ({ page, context }) => {
  await asPersona(context, { kind: "staff", userId: "u-lan" });
  await page.goto(`${A}/c-a-10a1`);
  await settle(page);
  const nav1 = page.getByRole("navigation", { name: /Mục của lớp 10A1/ });
  await expect(nav1.getByRole("link", { name: /Tổ & sơ đồ/ }).first()).toBeVisible();
  await page.goto(`${A}/c-a-10a2`);
  await settle(page);
  const nav2 = page.getByRole("navigation", { name: /Mục của lớp 10A2/ });
  await expect(nav2.getByRole("link", { name: /Tổ & sơ đồ/ })).toHaveCount(0);
  await page.goto(`${A}/c-a-10a2/seating`);
  await settle(page);
  await expect(page.getByText(/không có quyền|Không có quyền/).first()).toBeVisible();
});

test("Q15 — school B admin cannot open school A's class 10A1", async ({ page, context }) => {
  await asPersona(context, { kind: "staff", userId: "u-khang" });
  await page.goto(`${A}/c-a-10a1`);
  await settle(page);
  await expect(page.getByText(/không có quyền|Không có quyền/).first()).toBeVisible();
  await expect(page.getByText("Nguyễn Minh Anh")).toHaveCount(0);
});

test("Q16 — platform operator cannot open a school's student list", async ({ page, context }) => {
  await asPersona(context, { kind: "platform", userId: "u-bao" });
  await page.goto("/school/demo-school-a/students");
  await settle(page);
  await expect(page.getByText("Nguyễn Minh Anh")).toHaveCount(0);
});

test("Q29 — parent link cannot read another student's private announcement", async ({ page }) => {
  await openParentLink(page, "binh-minh", "demo-minhanh-me");
  await page.goto("/p/binh-minh/announcements/an-9");
  await settle(page);
  await expect(page.getByText("Nhắc hoàn thiện sản phẩm STEM")).toHaveCount(0);
  await page.goto("/p/binh-minh/announcements/an-8");
  await settle(page);
  await expect(page.getByText("Nhắc bổ sung giấy khám sức khỏe").first()).toBeVisible();
});

test("Q30 — revoked and expired links show the unavailable page without student data", async ({ page }) => {
  for (const [token, reason] of [["demo-revoked", "revoked"], ["demo-expired", "expired"], ["khong-hop-le", "invalid"]]) {
    await page.goto(`/p/binh-minh/access?t=${token}`);
    await page.waitForURL(new RegExp(`access-unavailable\\?reason=${reason}`));
    await settle(page);
    await expect(page.getByText("Hoàng Gia Huy")).toHaveCount(0);
    await expect(page.getByText("Phạm Thị Hà")).toHaveCount(0);
  }
});

test("Q23/Q24 — parent sees published week 4 = 97 and nothing for unpublished week 5", async ({ page }) => {
  await openParentLink(page, "binh-minh", "demo-minhanh-me");
  await page.goto("/p/binh-minh/conduct");
  await settle(page);
  await expect(page.getByText(/Tuần 4/).first()).toBeVisible();
  await expect(page.getByText("97").first()).toBeVisible();
  await expect(page.getByText(/Tuần 5/)).toHaveCount(0);
});
