# 0019 · Point shading with Eye-Dome Lighting (EDL)

Status: accepted (the owner chose "approach 1" and then option A with the three proposed smaller choices, 2026-11-16; softer strength and radius the same day, see Amendment) · 2026-11-16 · Task T12 (added by the owner)

## Context

The owner compared the viewer with commercial scan products. Those products look like built models; ours looks like dots. Four ways to close that gap were discussed:

1. Shade the points themselves (EDL, point size).
2. Rebuild a mesh from the points.
3. Gaussian splatting.
4. Scan-to-CAD: draw detected objects as shapes (for example, pipes as cylinders).

Options 2 and 3 were rejected:

- **Mesh (2):** a new pipeline step over 151.9M points, and thin pipes and valves come out blurred or full of holes.
- **Gaussian splatting (3):** it needs the original photos and camera poses, and we only have the `.ply`.

Option 4 is new scope and stays a separate proposal. The owner chose option 1.

**Why the picture looks flat today:**

- Every point gets a flat colour (class or RGB) and no shading.
- A pipe in front of a wall has the same colour at its edge as the wall behind it, so the eye cannot tell where one surface ends and the next one starts.
- ADR 0016 already set the point shape (circle), size (1.5, adaptive) and detail (`minNodePixelSize` 50). The only thing missing is shading.

**What EDL is.** Eye-Dome Lighting is the standard shading for point clouds, used by Potree and CloudCompare. It needs no normals, only the depth buffer:

1. For each pixel, read the depth of its 8 neighbours at a small radius.
2. Where the neighbours are closer to the camera than the pixel, the pixel is behind an edge or inside a gap, so it is made darker.
3. The darkening grows with the depth difference (Potree's formula: `shade = exp(-Σ max(0, log2 d − log2 dₙ) × strength)`).

The result is a dark outline around every object and soft shadow in corners. This is what makes points read as surfaces.

**What the code allows:**

- `@pnext/three-loader` has no built-in EDL (checked in `node_modules`), so we have to add a render pass ourselves.
- `Viewer.loop` renders the scene straight to the screen with a single `renderer.render(scene, camera)` call.
- Picking uses its own render (`Potree.pick`), so it is not affected by a change to the visible render.
- The selection box (lines) is in the same scene as the points.

## Options

### A. Own EDL pass, plain Three.js (recommended)

1. Render the scene into a `WebGLRenderTarget` that has a `DepthTexture`.
2. Draw one full-screen quad with a small EDL fragment shader (about 40 lines of GLSL) that reads the colour and depth textures.
3. Draw the selection box after the EDL pass, so the box lines are not darkened.

| | |
|---|---|
| **Pros** | No new dependency. About 100 lines in one file (`web/src/viewer/edl.ts`) that the owner can read top to bottom. Same style as ADR 0007 (plain Three.js, no framework). |
| **Cons** | We own the shader. Resize and pixel ratio must be handled by hand. |

### B. Three.js `EffectComposer` + a custom `ShaderPass`

The same EDL shader, run through `three/examples/jsm/postprocessing`.

| | |
|---|---|
| **Pros** | Ready for more passes later, such as anti-aliasing (FXAA). No npm dependency (it ships with `three`). |
| **Cons** | The composer does not give the shader a depth texture by default, so we still wire the depth target ourselves. More abstraction for a single pass. |

### C. A post-processing library with screen-space ambient occlusion (for example `postprocessing` + N8AO)

| | |
|---|---|
| **Pros** | Softer, more "rendered" shadows. |
| **Cons** | A new dependency (about 100 kB). SSAO is made for closed meshes: on points with gaps it gives noisy, speckled shadows and costs more GPU per frame. It is not the standard for point clouds. |

**Recommendation: A.** It is the smallest change that gives the effect, it is the method point-cloud viewers use, and every line is explainable. If we later need a second pass, moving to B is a small refactor.

## Smaller choices inside A (owner to confirm)

1. **On by default, with a toggle?** Proposed: on by default, and an "EDL" toggle next to the existing colour-mode and background toggles, so the before and after can be shown in the demo.
2. **Strength and radius:** proposed starting values are Potree's defaults (strength 1.0, radius 1.4 px). Tune them by eye on the 13 % demo tiles and on the full tiles, and record before/after screenshots in a spike note.
3. **Point size and detail:** keep ADR 0016's values for now. EDL often makes small gaps less visible, so re-check the size only after EDL is in, as a separate amendment if needed.

## Decision

Option A, with the three smaller choices as proposed:

- **EDL is on by default.** A "Shade edges (EDL)" checkbox under "Show structure and floor" turns it off. The state is `edlEnabled` in the shared view store.
- **Potree's defaults:** strength 1.0, radius 1.4, 8 neighbours. The radius is in CSS pixels and is multiplied by the pixel ratio, so the outline has the same width on a 1× and a 2× screen.
- **ADR 0016's point settings are unchanged.**

How it is built:

- `web/src/viewer/edl.ts` holds `EDL_SETTINGS`, `neighbourOffsets` and `EdlPass`.
- The viewer now has two scenes:
  - `scene` holds the points and is drawn through the pass.
  - `overlays` holds the selection box and the filter outlines. It is drawn afterwards, straight to the screen, so EDL does not outline the lines.
- The pass copies the points' depth to the screen (`gl_FragDepth`). Because of that, the selection box is still hidden behind points in front of it, with EDL on or off.
- The depth texture is float. With 24-bit integer depth, the log differences are too coarse far from the camera (near plane 0.05 m, far plane 500 m).
- **Colour, a bug found on the first screenshot:**
  - The off-screen target stores the scene background in linear colour. Copied to the screen unchanged, the background turned darker (#ececf2 instead of #f6f7f9).
  - The points' shader writes screen colours directly, so their colours copy correctly.
  - The fix: empty pixels take the background colour, in sRGB, from a uniform. A unit test checks the value.

## Consequences

- **Frame cost:** one extra full-screen pass, which reads the depth 9 times per pixel, plus a colour and depth target at canvas size.
  - **Not measured on a GPU yet.** The only numbers so far come from the cloud session's software renderer (SwiftShader, no GPU, 2× pixel ratio): about 8–10 fps with EDL and 43 fps without, on the fixture plant. That renderer runs the shader on the CPU, so the numbers say nothing about the MacBook Air.
  - **Owner to do:** run `pnpm --dir web perf` on the MacBook Air with the full tiles, against the PRD 8.3 target (30 fps or better), and add the result to the README performance table. The 2026-10-11 run in that table is the "EDL off" baseline.
- **Memory:** two textures at canvas size, about 2 × 2880 × 1800 × 4 bytes ≈ 41 MB at a 2× pixel ratio on a 1440 × 900 window.
- **Picking:** unchanged, because `Potree.pick` renders separately. The existing Playwright pick test must still pass.
- **Tests:**
  - Unit tests (`edl.test.ts`) cover the neighbour offsets, Potree's default values, the target size in device pixels with the radius in CSS pixels, and the background colour in sRGB.
  - A component test checks that the checkbox switches `edlEnabled` in the store.
  - A Playwright test checks, through the `?e2e` hook (`Viewer.shading`), that EDL is on by default and that the checkbox turns it off while the view keeps drawing.
  - The existing Playwright tests pass unchanged, GPU pick included.
  - The shader itself is judged by screenshots, not by a unit test.
- **Look not yet judged on real data:**
  - The fixture plant is a set of sparse random blobs, so EDL outlines almost every single point there.
  - On the real scan, the points are dense enough that EDL should outline objects instead.
  - **Owner to do:** judge strength and radius by eye on the demo tiles and the full tiles. Record before/after screenshots in a spike note if the values change.
- **Option 4 (Scan-to-CAD) stays open** as a separate proposal for the owner. It is not part of this task.

## Amendment: softer EDL, strength 0.6 and radius 1.0 (owner, 2026-11-16)

On the 13 % demo tiles, Potree's defaults drew a thick dark rim around every point up close, so the cloud looked grainy. Settings compared on the same views, on the M3 with vsync off ([spike note](../spikes/T12-edl-tuning.md)):

- strength 1.0, radius 1.4 px (the defaults): heavy outlines;
- **strength 0.6, radius 1.0 px, with point size 1.25 (chosen)**: thinner outlines, same frame time (close-up median 4.2 ms against 4.7 ms);
- EDL off: the floor fills with white gaps. On sparse tiles EDL also hides the gaps, so it stays on by default.

`EDL_SETTINGS` in `web/src/viewer/edl.ts` holds the new values; the unit test checks them. The point size change is an amendment to [ADR 0016](0016-point-detail-and-shape.md).

Frame cost on a GPU is now measured at a still camera: with EDL the close-up drew 3.0M points at a 4.2 ms median, well under 6.9 ms (144 Hz). The orbit run with `pnpm --dir web perf` on the full tiles is still open, because the full tiles are not on this machine.
