# 0004 · PotreeConverter: native macOS build of 2.1.2 with a small patch

Status: accepted by the owner · 2026-10-09 · Task T2

## Context

PotreeConverter 2.x turns the LAS file into Potree 2.0 tiles. Facts checked on 2026-10-08:

- No macOS or arm64 binary exists. 2.1.3 to 2.1.5 ship only a Windows build; the last Linux build is 2.1.2. No Homebrew formula, no maintained Docker image.
- The source supports only Linux and Windows. On macOS three helpers (`getMemoryData`, `getCpuData`, `launchMemoryChecker`) and a 64-bit `fseek` alias are missing.
- 2.1.4+ also calls `__debugbreak`, a Windows-only function, so it is unlikely to build on Linux either.
- Apple clang rejects some code (copying `std::execution::par`, narrowing). GCC accepts it.
- An open upstream PR (#686) adds macOS support but is based on an older tree and conflicts with the current branch.

## Options

1. **Native build of tag 2.1.2 + our own 120-line patch, compiled with Homebrew GCC 14 and TBB.** Patch adds a macOS branch using Mach/sysctl and a `fseeko` alias. Fast (5% sample in 2 s), no Docker needed.
2. **Linux container (Docker) built from source.** No patch, but needs Docker Desktop running (it did not start on this machine without user interaction), slower file access through the VM, and the newest tags do not build anyway, so it would also pin 2.1.2.
3. **Use the unmerged upstream PR #686 branch.** Someone else's patch, base older than 2.1.2's successors, unreviewed.

## Decision

Option 1. Pin `2.1.2`, keep the patch in `scripts/potree/potreeconverter-2.1.2-macos.patch`, build with `scripts/potree/build_converter.sh` into `.tools/` (gitignored). `scripts/build_potree.sh` calls the binary, or `$POTREE_CONVERTER` if set (e.g. a Linux binary in CI).

## Consequences

- 2.1.2 supports LAS point format 7, `classification` and `point source id`; verified on real data (see `docs/spikes/T2-report.md`).
- We own a small patch. It only adds code inside `#elif defined(__APPLE__)` blocks; Linux and Windows builds are unchanged.
- On macOS the converter's progress line shows "RAM" as the process's reserved virtual address space (~390 GB), not real use. Only the display is affected: the only memory throttle that is actually called (`ConcurrentWriter::waitUntilMemoryBelow`) counts bytes waiting to be written, not process memory.
- Tiles are not byte-identical between two runs (multi-threaded node order); the points per instance are. Verified by rebuilding the converter from a clean clone with `build_converter.sh`.
- Needs `brew install gcc tbb cmake ninja`. Documented in the README in T8.
- If upstream ships a working macOS build later, drop the patch.
