# 0007 · Viewer architecture, background default and scan metadata

Status: accepted by the owner · 2026-10-09 · Task T3

## Context

T3 builds the 3D viewer on `@pnext/three-loader` (ADR 0005). Three choices were open: how Three.js fits into React, how Structural and Floor (74 % of all points) are shown by default (PRD open question 1), and where the class list and class colours come from (PRD 8.3 says "from the API scan meta").

## Options and decisions

**Three.js in React**
- *Chosen:* a plain TypeScript `Viewer` class (`web/src/viewer/Viewer.ts`) owns renderer, camera, loader, picking, selection box and fly-to. A thin React component (`ViewerCanvas.tsx`) mounts it and forwards store changes to its methods. The loader is an imperative API with its own update loop, so this is the most direct fit and the easiest to explain; the non-3D logic (ray/box test, framing maths, colour tables) lives in `web/src/domain/` as pure functions with unit tests.
- *Not chosen:* react-three-fiber. Declarative scenes and a large ecosystem, but one more layer, and the loader's update loop and picking would still be imperative code inside `useFrame`.

**Background default**
- *Chosen:* shown, in light greys (`#c9ccd1`, `#e3e5e8`), with a "Show structure and floor" toggle. Keeps the spatial context while the coloured equipment stands out.
- *Not chosen:* hidden by default (equipment floats without context; hidden points are still downloaded and still count against the point budget, because the loader filters them in the shader) or full class colours (large grey surfaces would compete with small objects).
- Hiding uses the loader's `classificationFilter` + `useFilterByClassification`, which works in both colour modes and is also applied when picking, so hidden points cannot be clicked.

**Scan metadata**
- *Chosen:* the pipeline writes `data/scan.json` (`scripts/build_scan_meta.py`): name, licence, class list with colours from `scripts/class_palette.py`, zones in display order. The static demo reads it directly and the API seeds from it in T4, so there is one colour definition for 3D, lists and API.
- *Not chosen:* colours hard-coded in the frontend (fast, but a second definition once the API serves scan meta).

## Other choices made inside T3

- UI state shared by viewer and panels (selected instance, colour mode, background toggle) is one Zustand store (`web/src/state/viewStore.ts`); server data goes through TanStack Query hooks over `ScanDataSource` (PRD 6.1, 7).
- Picking: GPU pick on `point source id`; a hit on Structural/Floor selects nothing; if no point is under the cursor, the smallest bounding box on the ray wins (ADR 0005).
- Fly-to: 700 ms ease-in-out from the current viewing direction, distance chosen so the box fits both the vertical and horizontal field of view.
- Data files and tiles are served in development by a small Vite plugin (`sirv`, with HTTP Range) from the repo's `data/` at `/data`; nothing from `data/` is copied into the build. Tile URL: `VITE_TILES_BASE_URL`.
- Types in `web/src/data/types.ts` are written by hand from `docs/data-schema.md` until T5 generates them from the OpenAPI schema.

## Consequences

- The `Viewer` class itself has no unit tests (WebGL does not run in jsdom); it is covered by the browser check in T3 and the Playwright smoke test in T8. Its maths is tested in `domain/`.
- Showing the background costs point budget: at the default 3M budget, far views spend most points on structure and floor.
