import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const [base, output, database = "nsoc-secureflow1951-db"] = process.argv.slice(2);
const url = new URL(base);
assert.equal(url.hostname, "127.0.0.1");
assert.match(database, /^nsoc-secureflow1951-db(?:-[a-z]+)?$/);
const sql = (command) =>
  execFileSync("docker", ["exec", "-i", database, "psql", "-XAt", "-v", "ON_ERROR_STOP=1",
    "-U", "secureflow", "secureflow"], { input: command, encoding: "utf8" }).trim();
const date = new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const report = [];
await mkdir(output, { recursive: true });

try {
  for (const width of [1360, 390]) {
    const expired = `fixture-expired-${width}`;
    const active = `fixture-active-${width}`;
    const expiredName = "Temporary test fixture";
    const activeName = "Another test fixture";
    const editedName = "Active fixture renamed";
    sql(`
      INSERT INTO "User" (id, name, email, "updatedAt")
        VALUES ('mock-admin-id', 'Local Test Administrator', 'admin-local@example.test', now())
        ON CONFLICT (id) DO NOTHING;
      DELETE FROM "AuditLog" WHERE resource IN ('${expired}', '${active}');
      DELETE FROM "SuppressionRule" WHERE id LIKE 'fixture-expired-%' OR id LIKE 'fixture-active-%';
      INSERT INTO "SuppressionRule" (id,name,reason,"expiresAt","updatedAt") VALUES
        ('${expired}','${expiredName}','Local test fixture',now()-interval '1 day',now()),
        ('${active}','${activeName}','Local test fixture',now()+interval '1 day',now());
    `);
    const page = await browser.newPage({ viewport: { width, height: 920 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.context().addCookies([{ name: "mock-session", value: "admin", url: base }]);
    await page.goto(new URL("/admin/suppression-rules", base).href, { timeout: 90000 });
    await page.getByRole("heading", { name: "Suppression Rules", exact: true }).waitFor({ timeout: 30000 });
    await page.getByText("1 expired", { exact: true }).waitFor();
    await page.getByText("Expired", { exact: true }).waitFor();
    await page.getByText("Active", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: `Edit ${expiredName}` }).count(), 0);
    assert.equal(await page.getByRole("button", { name: `Renew ${activeName}` }).count(), 0);
    const openRenew = page.getByRole("button", { name: `Renew ${expiredName}` });
    await openRenew.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Renew Suppression Rule" });
    await dialog.waitFor();
    const input = dialog.getByLabel("New expiry date (UTC)");
    assert.equal(await input.evaluate(node => node.validity.valueMissing), true);
    await input.fill("2000-01-01");
    assert.equal(await input.evaluate(node => node.validity.rangeUnderflow), true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("title") === "Renew Rule");
    await openRenew.click();
    await input.fill(date);
    await page.waitForFunction(() => {
      const bounds = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
      return bounds && bounds.left >= 0 && bounds.right <= innerWidth &&
        Math.abs((bounds.left + bounds.right - innerWidth) / 2) <= 2;
    });
    await page.screenshot({
      path: join(output,`renewal-${width}.png`),
      animations: "disabled",
      style: "nextjs-portal { visibility: hidden }",
    });
    await dialog.getByRole("button", { name: "Renew Rule", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "renewed" }).waitFor();
    await page.getByText("0 expired", { exact: true }).waitFor();
    await page.getByRole("button", { name: `Edit ${expiredName}` }).waitFor();
    assert.equal(sql(`SELECT to_char("expiresAt",'YYYY-MM-DD') || '|' || reason FROM "SuppressionRule" WHERE id='${expired}'`), `${date}|Local test fixture`);
    assert.equal(sql(`SELECT count(*) FROM "AuditLog" WHERE resource='${expired}' AND "userId"='mock-admin-id'`), "1");

    const originalExpiry = sql(`SELECT "expiresAt" FROM "SuppressionRule" WHERE id='${active}'`);
    await page.getByRole("button", { name: `Edit ${activeName}` }).click();
    await page.getByPlaceholder("e.g. Suppress test fixture dummy tokens").fill(editedName);
    await page.getByRole("button", { name: "Update Rule" }).click();
    await page.getByRole("status").filter({ hasText: "updated" }).waitFor();
    assert.equal(sql(`SELECT "expiresAt" FROM "SuppressionRule" WHERE id='${active}'`), originalExpiry);
    await page.getByRole("button", { name: `Edit ${editedName}` }).click();
    await page.getByRole("heading", { name: "Edit Suppression Rule" }).waitFor();
    sql(`UPDATE "SuppressionRule" SET "expiresAt"=now()-interval '1 day' WHERE id='${active}'`);
    await page.getByRole("button", { name: "Update Rule" }).click();
    await page.getByRole("alert").filter({ hasText: "expired or changed" }).waitFor();
    assert.equal(sql(`SELECT count(*) FROM "AuditLog" WHERE resource='${active}'`), "1");
    assert.equal(sql(`SELECT count(*) FROM "SuppressionRule" WHERE id='${active}' AND "expiresAt"<=now()`), "1");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: `Renew ${editedName}` }).click();
    await input.fill(date);
    sql(`UPDATE "SuppressionRule" SET "expiresAt"=now()+interval '1 day' WHERE id='${active}'`);
    await dialog.getByRole("button", { name: "Renew Rule", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "no longer expired" }).waitFor();
    assert.equal(await input.inputValue(), date);
    assert.equal(sql(`SELECT count(*) FROM "AuditLog" WHERE resource='${active}'`), "1");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.reload();
    await page.getByRole("heading", { name: "Suppression Rules", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    report.push({ width, keyboardAndDateValidation: true, persistedRenewal: true, audit: true,
      ordinaryEditPreservedExpiry: true, staleEditRejected: true, duplicateRenewalRejected: true, retainedInput: true, pageErrors: errors });
    await page.close();
  }
  const userPage = await browser.newPage();
  await userPage.context().addCookies([{ name: "mock-session", value: "user", url: base }]);
  await userPage.goto(new URL("/admin/suppression-rules", base).href, { timeout: 90000 });
  assert.notEqual(new URL(userPage.url()).pathname, "/admin/suppression-rules");
  await writeFile(join(output,"report.json"), JSON.stringify({
    fixture: "Next.js local test auth and isolated PostgreSQL",
    adminRouteProtected: true, report,
  }, null, 2) + "\n");
} finally {
  await browser.close();
}
