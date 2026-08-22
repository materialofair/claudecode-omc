#!/usr/bin/env bash
# impact-report.sh — gather impact-analysis signals for the given files.
# Assumes git fetch origin main has already been run by Phase 0.
#
# Usage: impact-report.sh <file1> [<file2> ...]
#
# Output sections:
#   1. Recent history per file
#   2. Concurrent commits on origin/main not in HEAD
#   3. Exported symbols and reverse references per file

set -u

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <file1> [<file2> ...]" >&2
  exit 2
fi

echo "=== 1. Recent history per file (last 10 commits each) ==="
for f in "$@"; do
  echo "--- $f ---"
  if [ -e "$f" ]; then
    git log --oneline -10 -- "$f" || echo "  (no history)"
  else
    echo "  (file does not exist yet)"
  fi
  echo
done

echo "=== 2. Concurrent commits on origin/main not in HEAD ==="
incoming=$(git log --oneline origin/main ^HEAD 2>/dev/null || true)
if [ -z "$incoming" ]; then
  echo "  (none — local branch includes all of origin/main)"
else
  echo "$incoming"
fi
echo

echo "=== 3. Exported symbols and reverse references ==="
for f in "$@"; do
  if [ ! -e "$f" ]; then
    continue
  fi

  case "$f" in
    *.js|*.jsx|*.mjs|*.cjs)
      ;;
    *)
      continue
      ;;
  esac

  # 提取 export 的符号名（function/const/class/default）
  symbols=$(grep -oE 'export[[:space:]]+(default[[:space:]]+)?(function|const|class|let|var)[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*' "$f" 2>/dev/null \
    | sed -E 's/^export[[:space:]]+(default[[:space:]]+)?(function|const|class|let|var)[[:space:]]+//' \
    | sort -u)

  # 也提取 export { Name } 形式
  named_exports=$(grep -oE 'export[[:space:]]*\{[^}]+\}' "$f" 2>/dev/null \
    | sed 's/export[[:space:]]*{//;s/}//;s/,/\n/g' \
    | sed -E 's/[[:space:]]*as[[:space:]].*//;s/^[[:space:]]*//;s/[[:space:]]*$//' \
    | grep -v '^$' \
    | sort -u)

  all_symbols=$(printf '%s\n%s' "$symbols" "$named_exports" | grep -v '^$' | sort -u)

  if [ -z "$all_symbols" ]; then
    continue
  fi

  echo "--- $f ---"
  echo "  Exported symbols: $(echo "$all_symbols" | tr '\n' ', ' | sed 's/,$//')"

  for sym in $all_symbols; do
    # 跳过过于通用的符号名（长度 ≤3 或 "default"），避免大量误报
    if [ ${#sym} -le 3 ] || [ "$sym" = "default" ]; then
      continue
    fi

    # 使用 word boundary 搜索 src/ 和 electron/ 中引用该符号的文件（排除自身）
    refs=$(grep -rlnw "$sym" src/ electron/ --include="*.js" --include="*.jsx" 2>/dev/null \
      | grep -v "^$f$" \
      | head -20)
    if [ -n "$refs" ]; then
      echo "  $sym referenced by:"
      echo "$refs" | sed 's/^/    /'
    fi
  done
  echo
done
