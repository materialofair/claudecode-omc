---
name: start-dev
description: Adaptive development workflow that runs discover -> research -> plan -> implement -> verify with explicit quality gates.
---

# start-dev

Use this skill as a practical default for non-trivial feature delivery.

## Goal

Move from request to verified implementation with minimal rework.

## Workflow

1. Discover:
   - Map affected modules
   - Identify constraints and existing patterns
2. Research:
   - Validate version-sensitive APIs and framework behavior from official docs
3. Plan:
   - Define smallest reversible change
   - List files and risks
4. Implement:
   - Execute in small increments
   - Keep tests and build green
5. Verify:
   - Run targeted tests, then broader checks
   - Summarize residual risk honestly

## Delegation Pattern

- `explore` for codebase mapping
- `architect` for design tradeoffs
- `executor` for implementation
- `test-engineer` for test strategy
- `code-reviewer` or `verifier` for final quality pass

## Quality Gates

- Requirements are explicit before coding.
- Plan includes rollback strategy.
- Verification commands and results are captured.
- No completion claim without evidence.

