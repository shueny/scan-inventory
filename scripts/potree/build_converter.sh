#!/usr/bin/env bash
# Build PotreeConverter 2.1.2 natively on macOS (Apple Silicon) into .tools/.
#
# Why 2.1.2 and a patch: there is no macOS binary, and the source only supports
# Linux and Windows. 2.1.3+ also uses Windows-only calls. The patch adds a macOS
# branch for the memory/CPU helpers and a 64-bit fseek alias (ADR 0004).
#
# Needs: Homebrew gcc (g++-14), tbb, cmake, ninja
#   brew install gcc tbb cmake ninja
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
src=$repo_root/.tools/PotreeConverter
tag=2.1.2
prefix=$(brew --prefix)

if [[ ! -d $src ]]; then
  git clone --depth 1 --branch "$tag" https://github.com/potree/PotreeConverter.git "$src"
fi
git -C "$src" fetch --depth 1 origin tag "$tag"
git -C "$src" checkout --quiet --force "$tag"
git -C "$src" apply "$repo_root/scripts/potree/potreeconverter-2.1.2-macos.patch"

CC=gcc-14 CXX=g++-14 cmake -S "$src" -B "$src/build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS="-L$prefix/lib" -Wno-dev
ninja -C "$src/build"
echo "Built $src/build/PotreeConverter"
