#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
UPSTREAM_DIR="$ROOT_DIR/.upstream"
BUNDLED_DIR="$ROOT_DIR/bundled/upstream"

echo "Bundling upstream artifacts for npm distribution..."

if [ ! -d "$UPSTREAM_DIR" ]; then
  echo "Error: .upstream/ not found. Run 'omc-manage source sync' first."
  exit 1
fi

# Clean and recreate bundled directory
rm -rf "$BUNDLED_DIR"
mkdir -p "$BUNDLED_DIR"

# Copy each upstream source
for source_dir in "$UPSTREAM_DIR"/*/; do
  source_name="$(basename "$source_dir")"
  echo "  Bundling $source_name..."
  cp -r "$source_dir" "$BUNDLED_DIR/$source_name"
done

# Create manifest
cat > "$ROOT_DIR/bundled/manifest.json" << MANIFEST
{
  "bundledAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "sources": {
$(first=true; for source_dir in "$UPSTREAM_DIR"/*/; do
  source_name="$(basename "$source_dir")"
  artifact_count=$(find "$source_dir" -maxdepth 2 -type f | wc -l | tr -d ' ')
  if [ "$first" = true ]; then first=false; else echo ","; fi
  printf '    "%s": { "artifacts": %s }' "$source_name" "$artifact_count"
done)
  }
}
MANIFEST

echo ""
echo "Bundled to: bundled/"
echo "Manifest: bundled/manifest.json"
cat "$ROOT_DIR/bundled/manifest.json"
