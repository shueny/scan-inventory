#!/usr/bin/env bash
# Upload the public demo's data to the private R2 bucket (ADR 0015, docs/DEPLOY.md step 4).
#
#   scripts/deploy/upload_demo_data.sh [--dry-run]
#
# Copies, under the data version prefix (default v1):
#   data/potree/nora-random13/{metadata.json,hierarchy.bin,octree.bin} -> <version>/potree/nora/
#   data/{scan,instances,issues}.json                                  -> <version>/data/
#   data/demo/demo.webm (if present)                                    -> <version>/media/demo.webm
#
# Uses rclone with multipart upload (wrangler's upload is limited to 315 MB; octree.bin is
# ~395 MB). Needs an rclone remote for R2 (docs/DEPLOY.md step 3). Settings, from the
# environment:
#   R2_REMOTE       rclone remote name            (default: r2)
#   R2_BUCKET       bucket name                   (default: scan-inventory-demo)
#   DATA_VERSION    must match VITE_DATA_VERSION  (default: v1)
#   DEMO_TILES      local tile folder             (default: data/potree/nora-random13)
set -euo pipefail

remote=${R2_REMOTE:-r2}
bucket=${R2_BUCKET:-scan-inventory-demo}
version=${DATA_VERSION:-v1}
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
tiles=${DEMO_TILES:-$repo_root/data/potree/nora-random13}

command -v rclone >/dev/null || { echo "rclone not found: brew install rclone" >&2; exit 1; }
for f in metadata.json hierarchy.bin octree.bin; do
  [[ -f $tiles/$f ]] || { echo "missing $tiles/$f (build the 13 % tiles first, README)" >&2; exit 1; }
done
for f in scan.json instances.json issues.json; do
  [[ -f $repo_root/data/$f ]] || { echo "missing data/$f (run the pipeline first, README)" >&2; exit 1; }
done

# 100 MB parts: octree.bin goes up in 4 parts, each one retried on its own if it fails.
opts=(--s3-upload-cutoff=100M --s3-chunk-size=100M --checksum --progress)
# Appended only when asked: macOS's bash 3.2 treats an empty array as unset under `set -u`.
[[ ${1:-} == "--dry-run" ]] && opts+=(--dry-run)
dest="$remote:$bucket/$version"

echo "Tiles $tiles -> $dest/potree/nora/"
rclone copy "$tiles" "$dest/potree/nora/" --include "{metadata.json,hierarchy.bin,octree.bin}" "${opts[@]}"
echo "JSON data/ -> $dest/data/"
rclone copy "$repo_root/data" "$dest/data/" --include "{scan,instances,issues}.json" --max-depth 1 "${opts[@]}"
if [[ -f $repo_root/data/demo/demo.webm ]]; then
  echo "Video -> $dest/media/demo.webm"
  rclone copyto "$repo_root/data/demo/demo.webm" "$dest/media/demo.webm" "${opts[@]}"
fi

echo "Done. In the bucket now:"
rclone ls "$dest/"
