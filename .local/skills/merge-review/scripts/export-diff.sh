#!/usr/bin/env bash
# export-diff.sh — 对比单个文件在 origin/main 和当前 HEAD 之间的 export 签名变化。
# 使用临时目录避免并发碰撞。
#
# 支持：
#   - ES module: export default/const/function/class、export { ... }
#   - CommonJS: module.exports、exports.xxx
#
# Usage: export-diff.sh <file>
#
# 输出：
#   - 无变化时输出 "(no export changes)"
#   - 有变化时输出 diff 结果（分 ESM 和 CJS 两段）

set -u

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <file>" >&2
  exit 2
fi

file="$1"

if [ ! -e "$file" ]; then
  echo "(file does not exist: $file)"
  exit 0
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

# --- ESM exports（含缩进的 re-export）---
git show "origin/main:$file" 2>/dev/null | grep -E '^\s*export\s' > "$tmpdir/old_esm" 2>/dev/null || true
grep -E '^\s*export\s' "$file" > "$tmpdir/new_esm" 2>/dev/null || true

# --- CommonJS exports ---
git show "origin/main:$file" 2>/dev/null | grep -E '^\s*(module\.exports|exports\.)' > "$tmpdir/old_cjs" 2>/dev/null || true
grep -E '^\s*(module\.exports|exports\.)' "$file" > "$tmpdir/new_cjs" 2>/dev/null || true

esm_result=$(diff "$tmpdir/old_esm" "$tmpdir/new_esm" 2>/dev/null || true)
cjs_result=$(diff "$tmpdir/old_cjs" "$tmpdir/new_cjs" 2>/dev/null || true)

if [ -z "$esm_result" ] && [ -z "$cjs_result" ]; then
  echo "(no export changes)"
else
  if [ -n "$esm_result" ]; then
    echo "=== ESM export changes ==="
    echo "$esm_result"
  fi
  if [ -n "$cjs_result" ]; then
    echo "=== CommonJS export changes ==="
    echo "$cjs_result"
  fi
fi
