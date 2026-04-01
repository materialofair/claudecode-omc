#!/usr/bin/env bash
set -euo pipefail

# Sync upstream oh-my-claudecode artifacts to .upstream/oh-my-claudecode/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$ROOT_DIR/.upstream/oh-my-claudecode"
REMOTE="${1:-https://github.com/Yeachan-Heo/oh-my-claudecode.git}"
REF="${2:-main}"

echo "Syncing upstream oh-my-claudecode..."
echo "  Remote: $REMOTE"
echo "  Ref: $REF"
echo "  Target: $TARGET_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 --branch "$REF" --single-branch "$REMOTE" "$TMP_DIR" 2>/dev/null

# Sync skills
if [ -d "$TMP_DIR/skills" ]; then
  rm -rf "$TARGET_DIR/skills"
  cp -r "$TMP_DIR/skills" "$TARGET_DIR/skills"
  COUNT=$(find "$TARGET_DIR/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  echo "Synced $COUNT skills"
else
  echo "Warning: No skills/ directory found in upstream"
fi

# Sync agents
if [ -d "$TMP_DIR/agents" ]; then
  rm -rf "$TARGET_DIR/agents"
  cp -r "$TMP_DIR/agents" "$TARGET_DIR/agents"
  COUNT=$(find "$TARGET_DIR/agents" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d ' ')
  echo "Synced $COUNT agents"
else
  echo "Warning: No agents/ directory found in upstream"
fi

# Sync hooks
if [ -d "$TMP_DIR/hooks" ]; then
  rm -rf "$TARGET_DIR/hooks"
  cp -r "$TMP_DIR/hooks" "$TARGET_DIR/hooks"
  echo "Synced hooks"
else
  echo "Warning: No hooks/ directory found in upstream"
fi

echo "Done syncing upstream to .upstream/oh-my-claudecode/"
