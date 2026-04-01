---
name: planning-with-files
description: File-based planning workflow for complex tasks. Create and maintain task_plan.md, findings.md, and progress.md as persistent working memory.
---

# Planning With Files

Use this skill when the task is complex, long-running, or likely to exceed context continuity.

## Use When

- Multi-step tasks (typically 3+ phases)
- Investigations requiring many reads/searches
- Work that spans planning, implementation, and verification

## Core Pattern

Context window is volatile; files are durable.
Write key decisions and discoveries to disk early.

## Standard Files

- `task_plan.md`: goals, phases, decisions, errors
- `findings.md`: research notes, references, technical findings
- `progress.md`: chronological execution and test log

## Workflow

1. Initialize files in project root:
   - `bash skills/planning-with-files/scripts/init-session.sh`
2. Before major decisions, re-read `task_plan.md`.
3. After every 2 search/view operations, update `findings.md`.
4. After each phase, update status and `progress.md`.
5. Before handoff, validate completeness:
   - `bash skills/planning-with-files/scripts/check-complete.sh`

## Rules

- Do not start complex implementation without `task_plan.md`.
- Record all meaningful errors and attempted fixes.
- Do not repeat identical failed actions.
- Keep plans minimal and reversible.

## Templates

- `skills/planning-with-files/templates/task_plan.md`
- `skills/planning-with-files/templates/findings.md`
- `skills/planning-with-files/templates/progress.md`

