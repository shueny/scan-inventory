# T10 spike: why the demo looked coarse, and how much detail to stream

Date: 2026-10-11. Owner's question: "the demo looks blurry; how can it look sharper?" Decision in [ADR 0016](../adr/0016-point-detail-and-shape.md).

## What was wrong

The loader (`@pnext/three-loader`) streams an octree. In `updateChildVisibility` it computes, for each child tile, the radius of the child's bounding sphere projected on the screen: radius × (half the canvas height × pixel ratio) / (tan(fov / 2) × distance). The child is fetched only if that is at least `minNodePixelSize` device pixels. The app never set this, so it used the loader's default, **200 px**. In a view of the whole plant no child tile reaches 200 px, so the loader drew only the root tile: 13,105 points from a point budget of 3,000,000 (1440 × 900 window, 1× pixel ratio).

Each point was then drawn large, to cover the gaps, and square, so the edges looked blocky. The point shape was a smaller part of the problem.

## How it was measured

A throwaway Playwright script ran on the demo's 13 % tiles (`data/potree/nora-random13`, served by `vite dev`), in a visible Chromium window on the 144 Hz external display so the real GPU was used. The page was 1440 × 900 at Playwright's default pixel ratio of 1. A Retina window (2×) doubles the projected sizes, so it refines further at every setting. It used the `?e2e` hook to change `minNodePixelSize` and the point shape on the running viewer. For two fixed camera views (the wider one shows most of the plant, not all of it; both are in the images below), each setting was given 9 s to stream, then the view was captured and the camera orbited for 4 s while frame times were recorded (vsync on, 144 Hz display).

## Results (13 % demo tiles, MacBook Air M3, 1× pixel ratio)

| `minNodePixelSize` | wider view: points / tiles | closer view: points / tiles | tile data per view | frame time (median / p95) |
|---|---|---|---|---|
| 200 (loader default) | 92,210 / 11 | 275,147 / 29 | about 2–6 MB | 6.9 / 7.5–7.7 ms |
| 100 | 316,326 / 48 | 608,291 / 82 | about 7–13 MB | 6.9 / 7.4–7.5 ms |
| **50 (chosen)** | 1,039,138 / 176 | 1,386,165 / 242 | about 22–29 MB | 6.9 / 7.4–7.5 ms |
| 30 | 2,761,394 / 524 | 2,471,408 / 516 | about 52–58 MB | 6.9 / 7.2–7.4 ms |

- Tile data is points × 21 bytes (`octree.bin` is 414,688,617 bytes for 19,747,077 points).
- Each tile is one ranged request, which on the demo is one Pages Function request (free plan: 100,000 a day).
- Square and circle points gave the same point counts and frame times. Circles have cleaner edges at 200 and 100 px; at 50 px and below the two look almost the same.
- Every setting held 144 Hz. The cost of more detail is download size and Function requests, not frame rate.

![Wider view](img/t10-lod-wide.jpg)

![Closer view](img/t10-lod-close.jpg)

## After the change (in the app)

The whole-plant view in the browser pane (1440 × 900, 1×) went from 13,105 points (1 tile) to 209,427 points (26 tiles, 3 levels).

## First points

Does the extra detail delay the first picture? The app was built for production on the 13 % tiles (`vite build`, served by `vite preview`, whole-plant view, 1440 × 900, 1×). Each run used a fresh browser context with the cache off and Chrome's network throttling:

| connection | first points (3 runs) | 10 s later |
|---|---|---|
| no throttling | 0.22–0.28 s | 26 tiles, 209,427 points |
| 20 Mbit/s, 40 ms latency | 0.79 s | 26 tiles, 209,427 points |
| 5 Mbit/s, 80 ms latency | 2.23–2.26 s | 26 tiles, 209,427 points |

The root tile still arrives first, so first points stay well inside the PRD's 5 s. The finer tiles of the first view (about 4.4 MB) arrive within 10 s even at 5 Mbit/s. These runs leave out the live demo's Access check and the Pages Function; the owner's DEPLOY step 10 checks first points on the live address.

A first attempt against `vite dev` timed out under throttling: in development the app is hundreds of unbundled module files, so that setup does not represent the demo.
