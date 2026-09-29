import { test, expect, type Page } from "@playwright/test";
import { asPersona, collectErrors, settle } from "./helpers";

const SCHOOL = "/school/demo-school-a";
const FROM_YEAR = "y-a-2026";
const OLD_10A1_ROSTER = "/classroom/demo-school-a/y-a-2026/c-a-10a1/students";
const ROSTER_10A1 = 42; // seed: 42 active students in 10A1 (2026–2027)

/** Fill a DateField (dd/MM/yyyy text input that commits on blur). */
async function fillDate(page: Page, label: string, vi: string) {
  const input = page.getByLabel(label, { exact: false }).first();
  await input.fill(vi);
  await input.press("Tab");
}

test("SC07 — end of year: create 2027–2028, create 11A1, roll 10A1 up through the UI; old year unchanged", async ({ page, context }) => {
  test.setTimeout(240_000);
  await asPersona(context, { kind: "staff", userId: "u-hanh" });
  const errors = collectErrors(page);

  // Precondition: the rollover page has no target year yet.
  await page.goto(`${SCHOOL}/academic-years/${FROM_YEAR}/rollover`);
  await settle(page);
  await expect(page.getByRole("heading", { name: "Kết thúc năm và chuẩn bị năm mới" })).toBeVisible();
  await expect(page.getByText("Chưa có năm học mới")).toBeVisible();

  // 1) SC04 wizard — new year 2027–2028 (step 1 fields filled explicitly, terms prefilled from 2026–2027 shifted by one year).
  await page.goto(`${SCHOOL}/academic-years/new`);
  await settle(page);
  await expect(page.getByRole("heading", { name: "Tạo năm học" })).toBeVisible();
  const label = page.getByLabel(/^Năm học/).first();
  await label.fill("2027–2028");
  await fillDate(page, "Ngày bắt đầu", "01/08/2027");
  await fillDate(page, "Ngày kết thúc", "31/07/2028");
  await expect(label).toHaveValue("2027–2028");
  const next = page.getByRole("button", { name: "Tiếp tục" });
  await next.click();
  await expect(page.getByLabel("Tên học kỳ").first()).toBeVisible(); // step 2: terms
  await next.click();
  await expect(page.getByText("Tuần học dự kiến")).toBeVisible(); // step 3: weeks & holidays
  await next.click();
  await expect(page.getByText("Trạng thái sau khi tạo")).toBeVisible(); // step 4: review
  await page.getByRole("button", { name: "Tạo năm học" }).click();
  await expect(page.getByText("Đã tạo năm học 2027–2028 ở trạng thái Nháp")).toBeVisible();

  // 2) SC09 / O03 — create class 11A1 in the new year from the success screen.
  await page.getByRole("button", { name: "Tạo lớp cho năm mới" }).click();
  await page.waitForURL(/\/school\/demo-school-a\/classes/);
  const drawer = page.getByRole("dialog", { name: "Tạo lớp mới" });
  await expect(drawer).toBeVisible();
  const yearSelect = drawer.getByLabel("Năm học");
  await expect(yearSelect.locator("option:checked")).toHaveText(/2027–2028/);
  await drawer.getByLabel("Khối").selectOption({ label: "Khối 11" });
  await drawer.getByLabel("Tên lớp").fill("11A1");
  await drawer.getByLabel("Sức chứa tối đa").fill("45");
  await drawer.getByRole("button", { name: "Tạo lớp", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("link", { name: "11A1", exact: true })).toBeVisible();

  // 3) SC07 — rollover 2026–2027 → 2027–2028.
  await page.goto(`${SCHOOL}/academic-years/${FROM_YEAR}/rollover`);
  await settle(page);
  // Step 1: target year.
  const targetRadio = page.getByRole("radio", { name: /Năm học 2027–2028/ });
  await expect(targetRadio).toBeVisible();
  await targetRadio.check();
  await expect(page.getByText(/1 lớp đã tạo/)).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  // Step 2: per-class decisions.
  await expect(page.getByText("Quyết định theo lớp").first()).toBeVisible();
  const decision10A1 = page.getByLabel("Quyết định cho lớp 10A1");
  await decision10A1.selectOption({ label: "Lên lớp" });
  const target10A1 = page.getByLabel("Lớp đích cho lớp 10A1");
  await target10A1.selectOption({ label: "11A1" });
  await expect(target10A1.locator("option:checked")).toHaveText("11A1");
  for (const cls of ["10A2", "11A1"]) {
    await page.getByLabel(`Quyết định cho lớp ${cls}`).selectOption({ label: "Chuyển đi / tốt nghiệp" });
    await expect(page.getByLabel(`Lớp đích cho lớp ${cls}`)).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Xem trước", exact: true }).click();

  // Step 3: preview counts.
  const stat = (name: string) => page.locator("div.rounded-xl.border", { has: page.getByText(name, { exact: true }) }).locator("p").nth(1);
  await expect(stat("Lên lớp")).toHaveText(String(ROSTER_10A1));
  await expect(stat("Ở lại khối")).toHaveText("0");
  await expect(stat("Chưa chọn lớp đích")).toHaveText("0");
  const leaveCount = Number(await stat("Chuyển đi / tốt nghiệp").innerText());
  expect(leaveCount).toBeGreaterThan(0);
  const expected = page.getByRole("region", { name: "Sĩ số dự kiến lớp đích" });
  await expect(expected.getByRole("row", { name: new RegExp(`11A1\\s+0\\s+${ROSTER_10A1}\\s+${ROSTER_10A1}`) })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận xếp lớp" }).click();

  const dlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Xác nhận xếp lớp năm mới" });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText(`${ROSTER_10A1} học sinh → năm 2027–2028`);
  await dlg.getByRole("button", { name: "Xếp lớp", exact: true }).click();

  // 4) Success card.
  await expect(page.getByText("Đã xếp lớp năm học 2027–2028")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`${ROSTER_10A1} học sinh được ghi danh vào lớp năm mới; ${leaveCount} học sinh không chuyển tiếp`)).toBeVisible();

  // Old year's 10A1 roster is unchanged.
  await page.goto(OLD_10A1_ROSTER);
  await settle(page);
  await expect(page.getByRole("heading", { name: `Danh sách học sinh (${ROSTER_10A1})` })).toBeVisible();
  await expect(page.getByText(`của ${ROSTER_10A1} học sinh`)).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});
