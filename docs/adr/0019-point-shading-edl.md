# 0019 · Point shading with Eye-Dome Lighting (EDL)

Status: proposed (the owner chose "approach 1", making the point cloud read as solid surfaces, on 2026-11-16; the implementation options below are open) · 2026-11-16 · Task T12 (added by the owner)

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

Pending the owner's choice between A, B and C, and her answers to the three smaller choices.

## Consequences (if A is chosen)

- **Frame cost:** one extra full-screen pass, plus a colour and depth target at canvas size. The frame cost must be measured on the MacBook Air at the default budget, on the full tiles, against the PRD 8.3 target (30 fps or better). The result goes into the README performance table and `docs/LEARNING.md`.
- **Memory:** two textures at canvas size, about 2 × 2880 × 1800 × 4 bytes ≈ 41 MB at a 2× pixel ratio on a 1440 × 900 window.
- **Picking:** unchanged, because `Potree.pick` renders separately. The existing Playwright pick test must still pass.
- **Tests:**
  - A unit test for the pass setup (target size follows the canvas, toggle state).
  - The existing Playwright tests, plus a check through the `?e2e` hook that EDL is on by default.
  - The shader itself is judged by screenshots, not by a unit test.
- **Option 4 (Scan-to-CAD) stays open** as a separate proposal for the owner. It is not part of this task.
