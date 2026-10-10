/* global process, console */
// Record the README screenshots and the ~90 s demo video (PRD 9, T9) by playing the demo
// script (PRD 3) in a visible Chromium window. Run against the app in static mode with the
// real tiles, e.g. `pnpm --dir web dev --port 5174` (review changes stay in this throwaway
// browser profile; nothing is written to a database):
//
//   pnpm --dir web demo:record [url]      # default http://localhost:5174
//
// Writes docs/img/*.jpg, web/public/demo-screenshot.jpg and data/demo/demo.webm.
import { chromium } from "@playwright/test";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const url = process.argv.slice(2).find((a) => a !== "--") ?? "http://localhost:5174";
const repo = join(import.meta.dirname, "..", "..");
const videoDir = join(repo, "data", "demo");
await mkdir(videoDir, { recursive: true });
await mkdir(join(repo, "docs", "img"), { recursive: true });

const size = { width: 1440, height: 900 };
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: size, recordVideo: { dir: videoDir, size } });
const page = await context.newPage();
const pause = (s) => page.waitForTimeout(s * 1000);
const shot = (name) =>
  page.screenshot({ path: join(repo, "docs", "img", `${name}.jpg`), type: "jpeg", quality: 80 });

// 1-2: the scan streams in, coloured by class
await page.goto(url);
await page.getByText("Loading the scan…").waitFor({ state: "hidden", timeout: 60_000 });
await pause(6);
await shot("01-overview");
await page.screenshot({
  path: join(repo, "web", "public", "demo-screenshot.jpg"),
  type: "jpeg",
  quality: 70,
});
// orbit the camera for a few seconds
const box = await page.getByTestId("viewer").boundingBox();
if (box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i <= 120; i++) {
    await page.mouse.move(cx + Math.sin(i / 20) * 160, cy + Math.cos(i / 30) * 30);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.getByRole("button", { name: "Frame all" }).click();
  await pause(3);
}
await page.getByRole("checkbox", { name: "Show structure and floor" }).uncheck();
await pause(4);
await page.getByRole("checkbox", { name: "Show structure and floor" }).check();
await pause(1);

// 3: zones with counts; untick one
await page.getByRole("checkbox", { name: /^SC/ }).uncheck();
await pause(4);
await page.getByRole("checkbox", { name: /^SC/ }).check();
await pause(2);
// tag search
await page.getByRole("searchbox").fill("PCV");
await pause(4);

// 4-5: select an object from the table; the camera flies there
const lists = page.getByRole("region", { name: "Inventory and review" });
await lists.getByText("PCV-104B").click();
await pause(6);
await shot("02-object");
await page.getByRole("searchbox").fill("");
// confirm it with a note
const detail = page.getByRole("article");
await detail.getByRole("textbox").fill("Checked against P&ID sheet 2");
await pause(2);
await detail.getByRole("button", { name: /Confirm/ }).click();
await pause(4);

// 6-7: review queue, accept a suggestion with a note
await lists.getByRole("tab", { name: /Review queue/ }).click();
await pause(2);
await lists.getByRole("button", { name: /^P&ID says safety valve/ }).click();
await pause(4);
await lists.getByRole("textbox", { name: /Note/ }).fill("P&ID PSV-103A confirmed on site");
await pause(1);
await shot("03-review-queue");
await lists.getByRole("button", { name: /Accept: change class/ }).click();
await pause(5);
await lists.getByRole("tab", { name: /^Resolved/ }).click();
await pause(4);

// 8-9: dashboard and export
await lists.getByRole("tab", { name: "Dashboard" }).click();
await pause(4);
await shot("04-dashboard");
await lists.getByRole("button", { name: "Per class" }).click();
await pause(3);
await lists.getByRole("button", { name: "Chart" }).click();
await pause(3);
await lists.getByRole("button", { name: /Export CSV/ }).click();
await pause(4);

await page.getByRole("button", { name: "About" }).click();
await pause(7);
await page.keyboard.press("Escape");
await pause(1);

const video = page.video();
await context.close();
await browser.close();
if (video) {
  const target = join(videoDir, "demo.webm");
  await rm(target, { force: true });
  await rename(await video.path(), target);
  console.log(`video: ${target}`);
}
console.log("screenshots: docs/img/01-04, web/public/demo-screenshot.jpg");
