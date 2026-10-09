# T2 spike: independent verification

2026-10-09 · branch `t2-spike` at `3616d46` · checked against `docs/spikes/T2-report.md` and ADRs 0004–0006.

Everything below was re-run in this pass. Nothing in the repo was edited except this file. Temporary LAS files and tiles were deleted afterwards. Two generated files were rewritten with identical content: `data/las/nora.stats.json` (by re-exporting the full LAS) and `data/issues.json` (by re-running `build_issues.py`). The PotreeConverter in `.tools/` was rebuilt from a fresh clone, and the new binary is byte-identical to the old one.

Machine: Apple Silicon (arm64), macOS 15 (Darwin 24.6), about 17 GB free disk.

## Results

| # | check | result | command | key output |
|---|---|---|---|---|
| 1a | quality gate: `make check` | **pass** | `make check` | scripts: `All checks passed!`, mypy `no issues found in 13 source files`, `33 passed`; api: `1 passed`; web: eslint clean, `All matched files use Prettier code style!`; exit 0 |
| 1b | quality gate: pre-commit | **pass** | `uvx pre-commit run --all-files` | all 16 hooks `Passed`, exit 0 |
| 2a | tile point counts (`metadata.json`) | **pass** | read `data/potree/*/metadata.json` | full 151,901,442 · random13 19,747,077 · voxel5mm 18,105,623 · 5pct 7,600,555; all `encoding: DEFAULT`, attributes `position, rgb, classification, point source id` |
| 2b | octree depth | **pass** | same | 13 / 10 / 7 / 8, as in the report |
| 2c | `octree.bin` size = 21 B × points | **pass** | `ls -l` | 3,189,930,282 = 151,901,442 × 21; 414,688,617 = 19,747,077 × 21; 380,218,083 = 18,105,623 × 21; 159,611,655 = 7,600,555 × 21 |
| 2d | sizes in the report's tables | **pass, with small unit slips** | `ls -l`, `du -sh` | full 3.0 GB ✓, hierarchy 1,749,506 B (1.7 MB) ✓, 5 % hierarchy 68,266 B ✓. The "399 MB / 368 MB" octree.bin values are `du` of the whole folder; octree.bin alone is 395.5 / 362.6 MiB. The voxel LAS is listed as "636 MB", but 651,802,803 B is 621.6 MiB or 651.8 MB, so the figure matches neither unit (defect D7) |
| 2e | `data/las/*.stats.json` | **pass** | `cat` | point counts, 0 instances lost, smallest kept 143 (random13) / 371 (voxel5mm) / 66 (5pct), kept ratio 11.6–13.7 % vs 5.7–60.3 %, all as in the report and ADR 0006 |
| 3a | `point_source_id` survives, random13 | **pass** | `uv run --project scripts python scripts/verify_potree.py data/las/nora-random13.las data/potree/nora-random13` | `points in tiles: 19,747,077 (metadata says 19,747,077)` · `points per instance match: True` · `(instance, class) pairs match: True (263 pairs)` · exit 0 |
| 3b | same, voxel5mm | **pass** | `... verify_potree.py data/las/nora-voxel5mm.las data/potree/nora-voxel5mm` | `18,105,623 (metadata says 18,105,623)` · `True` · `True (263 pairs)` · exit 0 |
| 3c | same, full tiles | **pass** | `scripts/export_las.py --out data/las/nora.las`, then `verify_potree.py data/las/nora.las data/potree/nora`, then LAS deleted | export: `Wrote ... in 49 s`, 5,468,452,287 B, peak memory footprint 238 MB (max RSS 3.97 GB incl. mapped PLY pages); stats file identical to the committed one. Verify: `151,901,442 (metadata says 151,901,442)` · `True` · `True (263 pairs)` · exit 0 |
| 3d | independent cross-check, without the repo's verifier | **pass** | own decoder (scratchpad `indep_check.py`) compares tiles with `data/instances.json` | full: 263 ids, 0 class mismatches, **0 point_count mismatches, 0 bbox mismatches (> 0.2 mm)**, no instance with > 1 class. random13: 263 ids, 0 class mismatches, no point outside its instance bbox |
| 4a | determinism, same day | **pass** | `export_las.py --sample 0.05` twice to two paths, `cmp` | `cmp: identical`, sha256 `774e16dc…` for both; stats equal to `nora-5pct.stats.json` |
| 4b | determinism, across days | **pass on content, fail on bytes** | re-export `--sample 0.13`, `cmp -l` against the 2026-10-08 `nora-random13.las` | exactly **1 differing byte**, offset 90 (`31` → `32` octal): LAS header creation day-of-year (281 → 282). Stats identical (defect D3) |
| 4c | determinism, voxel (extra) | **pass** | re-export `--voxel-size 0.005`, `cmp` against `nora-voxel5mm.las` (same day) | `differing bytes: 0`; 486 s; **peak memory footprint 1.62 GB** (max RSS 4.44 GB) |
| 5a | converter builds from a fresh clone | **pass** | `mv .tools/PotreeConverter aside; scripts/potree/build_converter.sh` | `[99/99] Linking CXX executable PotreeConverter`, 18.8 s wall, exit 0, tag `2.1.2`, only the two patched files modified. sha256 `a30cf6f4…` **identical to the previous binary**. 13 compiler warnings, 0 errors |
| 5b | build script can be re-run | **pass** | `build_converter.sh` a second time | exit 0 (`checkout --force` drops the old patch, so `git apply` succeeds again) |
| 5c | convert + verify with the fresh binary | **pass** | `scripts/build_potree.sh data/las/verify-5pct-a.las data/potree/verify-5pct-{a,b}`; `verify_potree.py` on both | 2.4 s / 2.1 s; both `7,600,555` · `True` · `True (263 pairs)`; depth 8, hierarchy 68,266 B, same as `nora-5pct` |
| 5d | report: tiles are not byte-identical | **confirmed** | `cmp` of the two runs and of `nora-5pct` | `differ: char 1`; same point count, depth and per-instance counts |
| 6 | HTTP Range → 206 | **pass** | `npx --yes http-server@14.1.1 data/potree -p 8765 --cors -c-1`; `curl -D - -H 'Range: bytes=0-99' .../nora-random13/octree.bin` | `HTTP/1.1 206 Partial Content`, `Content-Range: bytes 0-99/414688617`, `Content-Length: 100`, body = first 100 bytes of the file. Also `bytes=3000000000-3000000020` on the 3 GB full file: `206`, body matches. Control: `python3 -m http.server` answers `HTTP/1.0 200 OK`, `Content-Length: 159611655` (ignores Range) |
| 7a | CLI error paths | **pass** | `export_las.py` with bad flags on a tiny synthetic PLY | `--sample 0`, `1.5`, `-0.1`, `nan` → `--sample must be in (0, 1]`, exit 1 · `--voxel-size -1`, `0` → `--voxel-size must be positive`, exit 1 · both flags → argparse `not allowed with argument --sample`, exit 2 · missing file → `File not found: …`, exit 1 · `--ply` without value → argparse error, exit 2 |
| 7b | edge cases in `export_las.py` | **5 low-severity defects** | code reading + tiny synthetic PLYs (scratchpad) | see D4–D6, D8, D9 below. `--sample 1.0` output is byte-identical to no sampling ✓. Class id 300 → clear message ✓. Voxel key overflow only below 4.5 µm on this scan (0.005 m uses 6.8e9 cells of 9.2e18) ✓ |
| 8 | T1 regression: issues | **pass** | `scripts/.venv/bin/python scripts/build_issues.py` | `45 issues`: class_mismatch 2, tag_missing_in_scan 6, untagged_equipment 9, tag_split 2, estimate_unreliable 24, zone_borrowed 2. `issues.json` byte-identical to before. Every PRD 5.6 item present: mismatch 1/PSV-103A and 169/VBT-109C; the 6 missing tags; untagged 2, 6, 10, 14, 17, 18, 165, 166, 206; P-109A → 175, 177 and P-109B → 176, 178; borrowed zone 13, 46 |
| 9a | `@pnext/three-loader` 1.0.0 colours by class | **pass** | minimal Vite page in scratchpad, three 0.160.1, `nora-5pct` tiles, pixel histogram via `readPixels` | CLASSIFICATION: **9 distinct colours**, all flat palette colours (`127,127,127`, `255,0,255`, `255,0,0`, …), 0 % white. RGB: 16,960 distinct colours, 2.1 % white |
| 9b | `potree-core` 2.0.15 does not | **pass, with one nuance** | same page, `lib=core` | Default material: CLASSIFICATION and RGB look the same, **83 % of lit pixels pure white** (screenshot is a white blowout). With `material.outputColorEncoding = 1` (SRGB): RGB is correct (1.9 % white, 21,979 colours), but **CLASSIFICATION still shows RGB**. Same histogram, top colours equal. Source confirms both causes: `#ifdef new_format vColor = rgba;` comes before any colour-type branch, and `fromLinear` calls `mix(linear*12.92, pow(...), cutoff)` with the arguments swapped. See D2 |
| 9c | ADR 0005: the loader ignores HTTP status | **confirmed** | grep of `@pnext/three-loader/build/potree.js` | `e=await this.xhrRequest(o,{headers:{Range:…}}); r=await e.arrayBuffer()`, no `status` or `ok` check |

Not checked: (b) GPU picking accuracy and timing, load-time figures in the browser, the report's PotreeConverter timings for full, random13 and voxel (only the 5 % run was repeated: 2.1–2.4 s vs the report's 2 s).

## Defects and wrong claims (most severe first)

None of these changes the report's answers (a)–(e) or the proposed decisions. Medium means "worth fixing before T3 or T9", low means "cosmetic or unreachable on the real data".

**D1 · medium · `build_potree.sh` deletes its output argument with `rm -rf` and does no check.**
`rm -rf "$output"` runs on any second argument. A typo such as `scripts/build_potree.sh data/las/x.las data/potree` deletes every tile variant (3.9 GB, minutes to rebuild). `.` or `data` would be worse.
Reproduce (read only): `sed -n 27p scripts/build_potree.sh`. Not executed on purpose.

**D2 · medium (claim is overstated) · potree-core RGB is not inherently broken.**
The report and ADR 0005 say potree-core RGB is "wrong: white/yellow in both modes". That is true only with the default material. Setting `pco.material.outputColorEncoding = 1` (SRGB; the enum is not exported) gives correct RGB. Classification colouring stays broken even with that setting, so the recommendation still holds. ADR 0005 should name class colouring as the deciding reason and mention the one-line RGB workaround.
Reproduce: scratchpad page `?lib=core&mode=rgb` → 83.5 % white; `?lib=core&mode=rgb&fix=1` → 1.9 % white; `?lib=core&mode=class&fix=1` → same histogram as RGB.

**D3 · low (claim is imprecise) · LAS output is byte-identical only on the same calendar day.**
The report says output is "byte-identical across runs". laspy writes the creation date into the LAS header (`creation_date= 2026-10-08` vs `2026-10-09`). Points and stats are reproducible; bytes 90–91 (day of year) and possibly 92–93 (year) are not. This matters only if T9 uses file hashes to decide whether to re-upload tiles. Fix: set `header.creation_date` to a fixed date.
Reproduce: `export_las.py --sample 0.13 --out /tmp/x.las` on another day, then `cmp -l data/las/nora-random13.las /tmp/x.las` → `91 31 32`.

**D4 · low · the friendly guard for instance ids outside 0..65535 cannot be reached.**
`np.bincount(instance, minlength=65536)` in `export()` runs before `to_las_points()` checks the range. An id of 70000 crashes with `ValueError: operands could not be broadcast together with shapes (65536,) (70001,)`, and −1 crashes with `'list' argument must have no negative elements`. The run still fails, so no wrong data is written, but the intended message is never shown. The real data has 263 ids, so this does not occur.
Reproduce: synthetic PLY with one point `scalar_instance = 70000` (scratchpad `edge/mkply.py`) → traceback at `export_las.py:166`.

**D5 · low · a NaN instance id silently becomes instance 0 on Apple Silicon.**
`np.rint(nan).astype(np.int64)` is `0` on arm64 (x86 gives INT64_MIN, which would crash in bincount instead). The point is exported as instance 0 (a real automated valve), with exit 0 and only a NumPy `RuntimeWarning`. Not present in nora.ply (the full-scan check 3d found the exact instance counts).
Reproduce: synthetic PLY with one `scalar_instance = nan` → `point_source_id` values `{0: 1, 5: 999}`.

**D6 · low · a failed export leaves a header-only LAS behind and overwrites the previous good file.**
`sys.exit()` inside `with laspy.open(out, "w")` closes a valid 375-byte LAS with 0 points. If `--out` pointed at an existing good file, that file is gone.
Reproduce: class id 300 → `Class id 8..300 does not fit classification`, exit 1, `c300.las` is 375 bytes.

**D7 · low · unit slips in the report's numbers.**
Voxel LAS "636 MB" (actually 621.6 MiB / 651.8 MB). The octree.bin column for random13 and voxel shows the folder total from `du` (399 / 368), not octree.bin (395.5 / 362.6 MiB). `metadata.json` is 2.3 KB, not 2.6 KB. No conclusion depends on these.

**D8 · low · `--voxel-size nan` and `inf` are accepted.**
`nan <= 0` is False, so both pass validation and produce a 1-point LAS with exit 0.
Reproduce: `export_las.py --ply <tiny> --voxel-size nan` → `output_points: 1`, exit 0.

**D9 · low · inconsistent paths and edge cases in `export_las.py`.**
- The docstring and `--out` default are `data/nora.las`. The report, `build_potree.sh` and the regenerated stats use `data/las/nora.las`.
- An empty PLY crashes in the stats step (`zero-size array to reduction operation minimum`).
- The voxel key `(ix*ny+iy)*nz+iz` overflows int64 below about 4.5 µm on this scan. Unreachable in practice.

## Extra facts for the decision

- **Voxel memory, now measured:** `--voxel-size 0.005` has a peak memory footprint of **1.62 GB** (486 s). That is under the PRD 10 limit of 2 GB, but uses 81 % of it. Random 13 % and the full export peak at about 0.24 GB. This supports ADR 0006's "would need work to meet the 2 GB limit with confidence".
- Max RSS (3.97–4.44 GB) counts the memory-mapped PLY pages, which macOS can reclaim. Peak memory footprint is the better measure for the 2 GB rule. The report used it as well.
- The converter binary needs `@rpath/liblaszip.dylib` next to it in `build/`, plus Homebrew `libtbb` and `libstdc++`. Copying only the executable elsewhere (for example through `$POTREE_CONVERTER`) will not run.

## Follow-up (2026-10-09)

- **D1 fixed:** `build_potree.sh` now only writes to a folder directly inside `data/potree/` and refuses to replace an existing folder without `metadata.json`. Tested with `data/potree`, `data`, `.`, `data/las/x`, `../x`, `data/potree/..`, `/tmp/x` (all refused) and a non-Potree folder (refused, contents kept); new and replaced tile folders still work.
- **D2 fixed:** ADR 0005 and the T2 report now say potree-core RGB works with `material.outputColorEncoding = 1`, and that class colouring is the deciding reason.
- **D3–D9 open** (low severity, none reachable with the real data). D3 matters for T9 if uploads are keyed by file hash.
