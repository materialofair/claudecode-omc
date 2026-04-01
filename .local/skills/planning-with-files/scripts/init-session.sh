#!/usr/bin/env bash
# Initialize planning files in the current project root.
# Usage: bash skills/planning-with-files/scripts/init-session.sh [project-name]

set -euo pipefail

PROJECT_NAME="${1:-project}"
DATE="$(date +%Y-%m-%d)"

echo "Initializing planning files for: ${PROJECT_NAME}"

if [[ ! -f task_plan.md ]]; then
  cp skills/planning-with-files/templates/task_plan.md task_plan.md
  echo "Created task_plan.md"
else
  echo "task_plan.md already exists, skipping"
fi

if [[ ! -f findings.md ]]; then
  cp skills/planning-with-files/templates/findings.md findings.md
  echo "Created findings.md"
else
  echo "findings.md already exists, skipping"
fi

if [[ ! -f progress.md ]]; then
  cp skills/planning-with-files/templates/progress.md progress.md
  # Replace session token with current date for convenience.
  sed -i.bak "s/\\[DATE\\]/${DATE}/g" progress.md && rm -f progress.md.bak
  echo "Created progress.md"
else
  echo "progress.md already exists, skipping"
fi

echo "Planning files initialized."

