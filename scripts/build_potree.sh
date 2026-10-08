#!/usr/bin/env bash
# Convert a LAS file to Potree 2.0 tiles.
#
# Usage (from the repo root):
#   scripts/build_potree.sh data/las/nora.las data/potree/nora
#
# Uses PotreeConverter from .tools/ (build it once with scripts/potree/build_converter.sh)
# or the binary in $POTREE_CONVERTER.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <input.las> <output-dir>" >&2
  exit 2
fi
input=$1
output=$2
repo_root=$(cd "$(dirname "$0")/.." && pwd)
converter=${POTREE_CONVERTER:-$repo_root/.tools/PotreeConverter/build/PotreeConverter}

[[ -f $input ]] || { echo "not found: $input" >&2; exit 1; }
[[ -x $converter ]] || {
  echo "PotreeConverter not found at $converter" >&2
  echo "build it with scripts/potree/build_converter.sh" >&2
  exit 1
}

rm -rf "$output"
mkdir -p "$output"
# Only the attributes the app uses keeps octree.bin small.
# "point source id" holds the instance id (see scripts/export_las.py).
"$converter" "$input" -o "$output" --attributes rgb classification "point source id"

echo "Wrote $output:"
ls -la "$output"
