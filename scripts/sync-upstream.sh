#!/usr/bin/env bash
set -euo pipefail

# Sync upstream oh-my-claudecode skills to .upstream/skills/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$ROOT_DIR/.upstream/skills"
REMOTE="${1:-https://github.com/Yeachan-Heo/oh-my-claudecode.git}"
REF="${2:-main}"

echo "Syncing upstream skills..."
echo "  Remote: $REMOTE"
echo "  Ref: $REF"
echo "  Target: $TARGET_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 --branch "$REF" --single-branch "$REMOTE" "$TMP_DIR" 2>/dev/null

if [ ! -d "$TMP_DIR/skills" ]; then
  echo "Error: No skills/ directory found in upstream"
  exit 1
fi

rm -rf "$TARGET_DIR"
cp -r "$TMP_DIR/skills" "$TARGET_DIR"

COUNT=$(find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
echo "Synced $COUNT skills to .upstream/skills/"
