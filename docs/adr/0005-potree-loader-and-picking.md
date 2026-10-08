# 0005 · Potree 2.0 loader and picking method

Status: proposed (needs owner decision) · 2026-10-09 · Task T2

## Context

The viewer (T3) needs a Three.js loader for Potree 2.0 tiles that can stream with a point budget, colour by classification and by RGB, and pick a point to get its instance id (`point source id`). Two maintained npm packages exist; both descend from the same code base. Both were tested on the real converted tiles in a throwaway page (`docs/spikes/T2-report.md`).

## Options

| | `@pnext/three-loader` 1.0.0 | `potree-core` 2.0.15 |
|---|---|---|
| Loads our Potree 2.0 tiles | yes (`new Potree("v2")`) | yes |
| Colour by classification | **works** | **does not work**: for Potree 2.0 data the shader always uses the RGB attribute and ignores `pointColorType` |
| RGB colour | correct | **wrong**: the 2.0 path has an sRGB conversion with swapped `mix()` arguments, colours blow out to white |
| Picking returns `classification` and `point source id` | yes, exact values, ~1–2 ms | yes, exact values, ~2 ms |
| Point budget | yes | yes |
| three.js | peer `~0.160.0` (strict) | peer `>0.125.0` |
| Licence | MIT | MIT |

Picking methods:

1. **GPU pick from the loader** (`Potree.pick`) reading `point source id` at the clicked point. Exact: the instance of the point under the cursor.
2. **Ray test against the 263 bounding boxes** from the inventory, smallest box wins. No dependence on the loader, but wrong where boxes overlap (a valve inside a pipe's box, anything inside the Structural box).

## Decision (proposed)

- Loader: `@pnext/three-loader` 1.0.0 with `three@0.160.x`.
- Picking: option 1, GPU pick reading `point source id`; fall back to the bounding-box test only if the pick misses (no point under the cursor).

## Consequences

- three.js is pinned to 0.160 (released 2023-12). Fine for points, lines and orbit controls; we do not need newer three features. Upgrading three later means upgrading or forking the loader.
- `@pnext/three-loader` names the attribute `"point source id"` (with spaces), while its shader's instance colouring expects `pointSourceID`. We do not need per-instance colouring in the MVP (selection is a bounding-box wireframe, PRD 8.3), so no shader change.
- The loader's network code does not check HTTP status: a server that ignores Range and returns `200` would send the whole `octree.bin` for every node. nginx and R2 support Range; verify with `curl -H 'Range: bytes=0-99'` (expect `206`) in T4 and T9.
