import { expect, test, type Page } from "@playwright/test";

// The demo path on the fixture plant (6 objects, 5 issues; e2e/fixtures/data).
// Each test starts with empty browser storage, so review changes never leak between tests.

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.getByText("E2E fixture plant")).toBeVisible();
  // The point cloud has loaded: the loading overlay is gone and no error is shown.
  await expect(page.getByText("Loading the scan…")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(/could not be loaded/)).toBeHidden();
  return errors;
}

const table = (page: Page) => page.getByRole("region", { name: "Inventory" });

test("loads the scan, the filters and the inventory without errors", async ({ page }) => {
  const errors = await open(page);

  await expect(table(page).getByText("5 of 5 objects")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^NE/ })).toBeChecked();
  expect(errors).toEqual([]);
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
