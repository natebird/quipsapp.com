#!/usr/bin/env bash
#
# Local preview server. Mirrors the GitHub Actions deploy step: pulls the pinned
# collections data from data.quipsapp.com, then serves the whole site over HTTP
# so fetch() works (browsers block fetch of local files over file://).
#
# Usage:
#   ./serve.sh            # pull data (if missing) and serve on :8000
#   ./serve.sh 4000       # serve on a different port
#   ./serve.sh --refresh  # re-pull data even if it already exists
#
set -euo pipefail
cd "$(dirname "$0")"

PORT=8000
REFRESH=0
for arg in "$@"; do
  case "$arg" in
    --refresh) REFRESH=1 ;;
    *[!0-9]*) ;;            # ignore non-numeric args
    *) PORT="$arg" ;;
  esac
done

VER="$(tr -d '[:space:]' < .data-version)"
BASE="https://data.quipsapp.com/v${VER}"

if [[ ! -f collections.json || "$REFRESH" -eq 1 ]]; then
  echo "Pulling collections v${VER} from ${BASE}"
  curl -fsSL "${BASE}/collections.json" -o collections.json
  mkdir -p collections
  for id in $(python3 -c "import json;print('\n'.join(c['id'] for c in json.load(open('collections.json'))['collections']))"); do
    curl -fsSL "${BASE}/collections/${id}.json" -o "collections/${id}.json"
  done
  echo "Pulled $(ls collections | wc -l) collection files."
else
  echo "Using existing collections data (run with --refresh to re-pull)."
fi

echo "Serving http://localhost:${PORT}  (Ctrl+C to stop)"
exec python3 -m http.server "$PORT"
