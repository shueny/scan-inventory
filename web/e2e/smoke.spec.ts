import { expect, test as base, type Page } from "@playwright/test";

// The demo path on the fixture plant (6 objects, 6 issues; e2e/fixtures/data).
// Each test starts with empty browser storage, so review changes never leak between tests.

/**
 * Every test fails on any page error, console error, failed request or HTTP error, not
 * only on what it asserts itself (self-review round 1 of the harness PR).
 */
const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console error: ${m.text()}`);
      });
      page.on("requestfailed", (r) => {
        const why = r.failure()?.errorText ?? "";
        // The loader cancels tile fetches it no longer needs (and a reload cancels the rest);
        // that is normal for tiles only. Every other cancelled request is a failure.
        const tile = r.url().includes("/data/potree/");
        if (!(tile && why === "net::ERR_ABORTED")) {
          problems.push(`request failed (${why}): ${r.url()}`);
        }
      });
      page.on("response", (r) => {
        if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
      });
      await use(problems);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

/** Open the app and wait until points are actually drawn (the ?stats overlay counts them). */
async function open(page: Page, url = "/?stats") {
  await page.goto(url);
  await expect(page.getByText("E2E fixture plant")).toBeVisible();
  await expect(page.getByText("Loading the scan…")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/could not be loaded/)).toBeHidden();
  await expect(page.getByText(/fps · [1-9][\d,]* points/)).toBeVisible({ timeout: 30_000 });
}

const table = (page: Page) => page.getByRole("region", { name: "Inventory and review" });

test("loads the scan, draws points, and shows the filters and the inventory", async ({ page }) => {
  await open(page);

  await expect(table(page).getByText("5 of 5 objects")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^NE/ })).toBeChecked();
});

test("demo step 3: unticking a zone hides its objects from the list", async ({ page }) => {
  await open(page);

  await page.getByRole("checkbox", { name: /^NE/ }).uncheck();

  await expect(table(page).getByText("3 of 5 objects")).toBeVisible();
  await expect(table(page).getByText("PSV-1")).toBeHidden();
});

test("demo step 5: a table row selects the object and shows its details", async ({ page }) => {
  await open(page);

  await table(page).getByText("PSV-1").click();

  const detail = page.getByRole("article");
  await expect(detail.getByRole("heading", { name: "PSV-1" })).toBeVisible();
  // The fields of demo step 4: element, nominal size, system, zone, points, size.
  for (const value of ["safety valve", '2" (P&ID, inches)', "S - 1", "NE", "1,001"]) {
    await expect(detail.getByRole("definition").getByText(value, { exact: true })).toBeVisible();
  }
});

test("demo step 7 (one object): a review with a note survives a reload", async ({ page }) => {
  await open(page);
  await table(page).getByText("PSV-1").click();
  const detail = page.getByRole("article");

  await detail.getByRole("textbox").fill("checked on site");
  await detail.getByRole("button", { name: /Confirm/ }).click();
  await expect(detail.getByText("Status: Unreviewed → Confirmed")).toBeVisible();

  await page.reload();
  await table(page).getByText("PSV-1").click();
  await expect(page.getByRole("article").getByText("“checked on site”")).toBeVisible();
  await expect(table(page).getByRole("row", { name: /PSV-1/ })).toContainText("Confirmed");
});

test("demo steps 6 and 7: resolve an issue from the queue, kept after a reload", async ({
  page,
}) => {
  await open(page);
  const lists = page.getByRole("region", { name: "Inventory and review" });

  await lists.getByRole("tab", { name: "Review queue (6)" }).click();
  // Sorted by severity: the class mismatch (high) comes first.
  await expect(lists.getByRole("button", { name: /^class_mismatch:1/ })).toBeVisible();
  const first = lists.getByRole("listitem").first();
  await expect(first).toContainText("Class mismatch");

  await lists.getByRole("button", { name: "class_mismatch:1" }).click();
  // Selecting the issue selects its object: the detail panel shows it.
  await expect(page.getByRole("heading", { name: "PSV-1" })).toBeVisible();
  await lists.getByRole("textbox", { name: /Note/ }).fill("P&ID is right");
  await lists
    .getByRole("button", { name: /Accept: change class to Pressure safety valve/ })
    .click();
  await expect(lists.getByRole("tab", { name: "Open (5)" })).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Review queue (5)" }).click();
  await page.getByRole("tab", { name: "Resolved (1)" }).click();
  await page.getByRole("button", { name: /class_mismatch:1/ }).click();
  await expect(
    page.getByText("Class: Piping components → Pressure safety valve").first(),
  ).toBeVisible();
  await expect(page.getByText("“P&ID is right”").first()).toBeVisible();
});

test("demo steps 8 and 9: dashboard numbers and a CSV export with review status", async ({
  page,
}) => {
  await open(page);
  // One review first, so the export has a status other than "unreviewed".
  await table(page).getByText("PSV-1").click();
  await page
    .getByRole("article")
    .getByRole("button", { name: /Confirm/ })
    .click();
  await expect(page.getByRole("article").getByText("Status: Unreviewed → Confirmed")).toBeVisible();

  const lists = page.getByRole("region", { name: "Inventory and review" });
  await lists.getByRole("tab", { name: "Dashboard" }).click();
  // The chart really draws bars, also after switching to the per-class table and back.
  const bars = lists.locator(".recharts-bar-rectangle");
  await expect.poll(() => bars.count()).toBeGreaterThan(0);
  await lists.getByRole("button", { name: "Per class" }).click();
  await expect(lists.getByRole("table", { name: "Objects per zone and class" })).toBeVisible();
  await expect(bars).toHaveCount(0);
  await lists.getByRole("button", { name: "Chart" }).click();
  await expect.poll(() => bars.count()).toBeGreaterThan(0);
  await expect(lists.getByText("estimate (PCA)")).toBeVisible();
  await expect(lists.getByText(/1 of 5 objects reviewed/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    lists.getByRole("button", { name: "Export CSV (5 objects)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^nora-inventory-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const csv = (await readFile(path, "utf8")).replace("\uFEFF", "");
  const [header, ...rows] = csv.trimEnd().split("\r\n");
  expect(header).toContain("review_status");
  expect(rows).toHaveLength(5);
  expect(rows.find((r) => r.startsWith("1,PSV-1,"))).toMatch(/,confirmed$/);
});

test("the loaded cloud streams detail from 50 px tiles and draws round points (ADR 0016)", async ({
  page,
}) => {
  await open(page, "/?stats&e2e");
  type Style = { minNodePixelSize: number; shape: number; visibleTiles: number };
  const style = () =>
    page.evaluate(
      () => (window as unknown as { __scanViewer: { pointStyle: Style } }).__scanViewer.pointStyle,
    );
  // PointShape.CIRCLE is 1 in @pnext/three-loader.
  expect(await style()).toMatchObject({ minNodePixelSize: 50, shape: 1 });
  // The effect, not only the setting: the default view refines past the root tile. With the
  // loader's default of 200 px it draws the root alone.
  await expect
    .poll(async () => (await style()).visibleTiles, { timeout: 15_000 })
    .toBeGreaterThan(1);
});

test("demo step 4: clicking an object in 3D selects exactly that object, by GPU pick", async ({
  page,
}) => {
  await open(page, "/?stats&e2e");
  // Object 3 (a pipe) has its centre at (3, 0, 37) in the fixture plant. Click exactly
  // there, as the camera shows it now.
  const at = await page.evaluate(() => {
    const v = (
      window as unknown as {
        __scanViewer: { projectToScreen(p: number[]): { x: number; y: number } };
      }
    ).__scanViewer;
    return v.projectToScreen([3, 0, 37]);
  });
  await page.mouse.click(at.x, at.y);

  const article = page.getByRole("article");
  await expect(article.getByText("Object 3", { exact: true })).toBeVisible();
  await expect(article.getByText("Pipe", { exact: true }).first()).toBeVisible();
  // The point under the cursor was picked on the GPU, not by the bounding-box fallback.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __scanViewer: { lastPickMethod: string } }).__scanViewer
          .lastPickMethod,
    ),
  ).toBe("gpu");
  // The same object is selected in the table.
  await expect(table(page).getByRole("row", { selected: true })).toContainText("Pipe");
});

test("demo mode: the banner says where changes go, and Reset demo forgets them", async ({
  page,
}) => {
  await open(page);
  const banner = page.getByRole("region", { name: "Demo mode" });
  await expect(banner).toContainText("saved only in this browser");

  await table(page).getByText("PSV-1").click();
  await page
    .getByRole("article")
    .getByRole("button", { name: /Confirm/ })
    .click();
  await expect(table(page).getByRole("row", { name: /PSV-1/ })).toContainText("Confirmed");

  await banner.getByRole("button", { name: "Reset demo" }).click();
  await banner.getByRole("button", { name: "Yes, reset" }).click();
  await expect(table(page).getByRole("row", { name: /PSV-1/ })).toContainText("Unreviewed");
  await page.reload();
  await expect(table(page).getByRole("row", { name: /PSV-1/ })).toContainText("Unreviewed");
});
