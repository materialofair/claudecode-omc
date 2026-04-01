#!/usr/bin/env bash
# Verify all phases in task_plan.md are complete.
# Usage: bash skills/planning-with-files/scripts/check-complete.sh [task_plan_path]

set -euo pipefail

PLAN_FILE="${1:-task_plan.md}"

if [[ ! -f "${PLAN_FILE}" ]]; then
  echo "ERROR: ${PLAN_FILE} not found"
  exit 1
fi

TOTAL="$(grep -c "### Phase" "${PLAN_FILE}" || true)"
COMPLETE="$(grep -cF "**Status:** complete" "${PLAN_FILE}" || true)"
IN_PROGRESS="$(grep -cF "**Status:** in_progress" "${PLAN_FILE}" || true)"
PENDING="$(grep -cF "**Status:** pending" "${PLAN_FILE}" || true)"

echo "Total phases: ${TOTAL}"
echo "Complete: ${COMPLETE}"
echo "In progress: ${IN_PROGRESS}"
echo "Pending: ${PENDING}"

if [[ "${TOTAL}" -gt 0 && "${COMPLETE}" -eq "${TOTAL}" ]]; then
  echo "ALL PHASES COMPLETE"
  exit 0
fi

echo "TASK NOT COMPLETE"
exit 1

