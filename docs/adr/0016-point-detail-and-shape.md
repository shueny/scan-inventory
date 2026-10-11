# 0016 · Point detail (minNodePixelSize 50) and round points

Status: accepted (owner chose 50 px and circles, 2026-10-11; point size 1.5 added the same day, see Amendment) · 2026-10-11 · Task T10 (added by the owner after T9)

## Context

The owner found the live demo blurry. Measurements are in [docs/spikes/T10-point-detail.md](../spikes/T10-point-detail.md).

The loader (`@pnext/three-loader`) streams an octree: a child tile is fetched only if its bounding sphere, projected on the screen, has a radius of at least `minNodePixelSize` device pixels (the loader uses half the canvas height × the pixel ratio). The viewer never set this value, so the loader's default of 200 px applied. The whole-plant view drew only the root tile, 13,105 points of a 3,000,000 point budget (1440 × 900 window, 1× pixel ratio). The points were drawn large and square to cover the gaps, so the picture looked blocky.

## Options

On the 13 % demo tiles, MacBook Air M3, 144 Hz display, 1× pixel ratio, for the two camera views in the spike images (the wider one shows most of the plant, not all of it):

| `minNodePixelSize` | points, wider / closer view | tiles per view | tile data per view |
|---|---|---|---|
| 200 (default) | 92k / 275k | 11–29 | 2–6 MB |
| 100 | 316k / 608k | 48–82 | 7–13 MB |
| 50 | 1.04M / 1.39M | 176–242 | 22–29 MB |
| 30 | 2.76M / 2.47M | 516–524 | 52–58 MB |

Every value held 144 Hz (median 6.9 ms, p95 at most 7.7 ms). The cost of more detail is in the download, not the frame rate:

- more data per view;
- on the demo, one Pages Function request per tile (100,000 a day on the free plan).

Point shape: square (the loader default), circle, or paraboloid (a circle with depth). At these sizes circles and squares cost the same. Circles have cleaner edges at 100–200 px; at 50 px the two look almost the same. Paraboloid writes depth per pixel, which turns off early depth testing; it was not needed.

## Decision

- `minNodePixelSize = 50` and circular points.
- Point size stays adaptive, with size 1 and a minimum of 2 px.
- The settings live in `web/src/viewer/pointStyle.ts` (`POINT_STYLE`, `applyPointStyle`), and `Viewer.load` applies them to the loaded cloud.
- A unit test checks the settings.
- A Playwright test checks that the real loaded cloud carries them and draws more than the root tile on the fixture plant (`Viewer.pointStyle`, through the `?e2e` hook). With 200 px the same test sees a single tile and fails.

## Consequences

- **Demo:**
  - 10 to 16 times more points in far views (whole plant: 13,105 points in 1 tile → 209,427 points in 26 tiles), at 144 Hz.
  - In the spike's two zoomed views, a view downloads about 22–29 MB of tiles instead of 2–6 MB and needs 180–250 Function requests instead of 11–29 (the default whole-plant view: 26 tiles, about 4.4 MB, instead of 1 tile), so the free plan allows roughly 100 visits a day instead of a few hundred. [ADR 0015](0015-demo-hosting-cloudflare.md) and `docs/DEPLOY.md` are updated.
- **First points:** the root tile (about 0.3 MB) still comes first, and finer tiles stream in after it. Measured on throttled connections in the spike (section "First points").
- **Picking:** the GPU pick draws the same round points, so the corners of the old squares no longer count as hits. The pick reads a 9 × 9 CSS-pixel window (18 × 18 device pixels on a 2× screen) and takes the hit nearest its centre, so a click near a point still finds it; the Playwright pick test passes unchanged.
- **Full local mode (151.9M points):**
  - The 3M budget is now reached at mid zoom (before: at most 373k points).
  - It still holds 144 Hz: median 6.9 ms, worst 13.9 ms, no frame over 33 ms. The README performance table is updated.
- **Slower machines** draw more points than before. The budget still caps the work at 3M points. If a weaker GPU struggles, lower the budget or raise `minNodePixelSize`; both are one-line changes in `pointStyle.ts` and `config.ts`.

## Amendment: point size 1.5 (owner, 2026-10-11)

After the change went live, the owner saw white specks on near gray beams and on the floor. The cause was the circles themselves. Squares can cover a surface edge to edge, but four round points leave a gap between them, and on light gray surfaces in front of the white background those gaps show as specks. The sparse 13 % sample makes the gaps larger up close.

Options compared at 2× pixel ratio (like a Retina screen), on the 13 % tiles; image in the [spike](../spikes/T10-point-detail.md#point-size):

- size 1 (as decided above): specks on near beams and the floor;
- **size 1.5 (chosen)**: far fewer specks, pipes keep their shape;
- size 2: solid, but valves and thin pipes start to merge;
- minimum size 3 px instead of 2: no visible change up close; it only affects tiny far points.

In the whole-plant view all four look the same. Larger points mean more pixels to draw. On the full tiles, with up to 3.0M points drawn, the M3 still holds 144 Hz: median 6.9 ms, worst 7.9 ms, no frame over 33 ms (README performance table).
