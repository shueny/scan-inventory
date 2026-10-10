/* global process, console, window, document, performance, requestAnimationFrame, cancelAnimationFrame */
// Frame times while orbiting the real scan (PRD 8.3), in a visible Chromium window so the
// real GPU is used. Run with the app serving the full tiles, e.g. `docker compose up`:
//
//   pnpm --dir web perf                      # http://localhost:8088/?stats
//   pnpm --dir web perf <url>
//
// For each view (whole plant, then three zoom levels) it waits for tiles to stream, orbits
// the camera for 6 s and records the time between frames with requestAnimationFrame. With
// vsync on (the default) the browser draws at most once per display refresh, so a steady
// interval equal to the refresh period means "keeps up"; the slowest frames show stutter.
// The interval includes the page's CPU work but not GPU work that is still queued, so it
// cannot tell how much headroom the GPU has; it answers "does it stay smooth".
import { chromium } from "@playwright/test";

// pnpm 10 passes a "--" separator through to the script; skip it.
const url = process.argv.slice(2).find((a) => a !== "--") ?? "http://localhost:8088/?stats";
const views = [
  { label: "whole plant", zoomSteps: 0 },
  { label: "mid zoom", zoomSteps: 6 },
  { label: "close-up", zoomSteps: 12 },
  { label: "very close", zoomSteps: 18 },
];

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const started = Date.now();
await page.goto(url);
const stats = page.getByText(/fps · [1-9][\d,]* points/);
await stats.waitFor({ timeout: 60_000 });
const firstPointsMs = Date.now() - started;
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
const box = await page.getByTestId("viewer").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
const pointsDrawn = async () =>
  Number((/([\d,]+) points/.exec((await stats.textContent()) ?? "")?.[1] ?? "0").replace(/,/g, ""));

await page.mouse.move(cx, cy);
const rows = [];
let zoomed = 0;
for (const view of views) {
  for (; zoomed < view.zoomSteps; zoomed++) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(6000); // let the tiles for this view stream in
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  });
  await page.mouse.down();
  const orbitStart = Date.now();
  let step = 0;
  let maxPoints = 0;
  while (Date.now() - orbitStart < 6000) {
    const a = (step++ / 60) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * 120, cy + Math.sin(a) * 50, { steps: 2 });
    if (step % 20 === 0) maxPoints = Math.max(maxPoints, await pointsDrawn());
  }
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__frames.slice(5).sort((a, b) => a - b);
  });
  const at = (q) => frames[Math.min(frames.length - 1, Math.floor(q * frames.length))];
  rows.push({
    view: view.label,
    pointsDrawnMax: maxPoints,
    frames: frames.length,
    medianMs: +at(0.5).toFixed(1),
    p95Ms: +at(0.95).toFixed(1),
    p99Ms: +at(0.99).toFixed(1),
    worstMs: +frames[frames.length - 1].toFixed(1),
    framesOver33ms: frames.filter((f) => f > 33.3).length,
  });
}
await browser.close();
console.log(JSON.stringify({ url, renderer, firstPointsMs, rows }, null, 2));
