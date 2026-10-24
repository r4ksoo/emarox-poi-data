#!/usr/bin/env bash
# Download each Geofabrik extract, pull the POI candidates out of it, delete the .pbf.
# One file at a time, so the runner's disk only ever holds the largest single country.
# Usage: build/extract-all.sh <work dir>
set -euo pipefail

WORK="${1:-work}"
PY="${PYTHON:-python}"
UA="emarox-poi-data/1.0 (+https://github.com/r4ksoo/emarox-poi-data)"
mkdir -p "$WORK/pbf" "$WORK/raw"

grep -v '^\s*#' "$(dirname "$0")/countries.txt" | grep -v '^\s*$' | while read -r path; do
    name="$(basename "$path")"
    pbf="$WORK/pbf/$name.osm.pbf"
    echo "== $path"
    curl -fsSL --retry 5 --retry-delay 30 -A "$UA" -o "$pbf" "https://download.geofabrik.de/$path-latest.osm.pbf"
    "$PY" "$(dirname "$0")/extract.py" "$pbf" "$WORK/raw/$name.jsonl"
    rm -f "$pbf"
done
