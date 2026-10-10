#!/usr/bin/env bash
# The smoke tests against the public demo stack, locally (ADR 0015): the demo build served
# by `wrangler pages dev` (the Cloudflare runtime), with the fixture plant in a local R2
# bucket read through functions/r2/[[path]].ts. No Cloudflare account is needed.
#
#   pnpm --dir web test:e2e:demo
set -euo pipefail
cd "$(dirname "$0")/.."
port=${DEMO_PORT:-8791}
state=$(mktemp -d)
log="$state/wrangler.log"
cleanup() {
  status=$?
  [[ -n ${server:-} ]] && kill "$server" 2>/dev/null
  if [[ $status -ne 0 && -f $log ]]; then
    echo "--- wrangler pages dev log (last 40 lines) ---" >&2
    tail -40 "$log" >&2
  fi
  rm -rf "$state"
  exit "$status"
}
trap cleanup EXIT

pnpm -s build:demo >/dev/null
fixtures=e2e/fixtures/data
put() { npx wrangler r2 object put "scan-inventory-demo/v1/$1" --local --persist-to "$state" --file "$2" >/dev/null; }
for f in scan.json instances.json issues.json; do put "data/$f" "$fixtures/$f"; done
for f in metadata.json hierarchy.bin octree.bin; do put "potree/nora/$f" "$fixtures/potree/nora/$f"; done

npx wrangler pages dev dist --port "$port" --persist-to "$state" >"$log" 2>&1 &
server=$!
ready=no
for _ in $(seq 1 90); do
  if curl -sf -o /dev/null "http://127.0.0.1:$port/"; then ready=yes; break; fi
  sleep 1
done
if [[ $ready != yes ]]; then
  echo "wrangler pages dev did not answer on port $port within 90 s" >&2
  exit 1
fi
E2E_BASE_URL="http://127.0.0.1:$port" npx playwright test "$@"
