# Coding Discipline

These are always-on guardrails for non-trivial coding work.

## Think Before Coding

- State assumptions that materially affect design, scope, or behavior.
- Surface ambiguity instead of silently choosing an interpretation.
- Ask for clarification when missing detail can change the implementation.
- Prefer the simpler path when it still satisfies the real goal.

## Simplicity First

- Make the smallest correct change that solves the task.
- Do not add speculative features, configuration, or extension points.
- Avoid new abstractions for one-off logic.
- If the solution expands quickly, step back and simplify it.

## Surgical Changes

- Change only the files and lines required for the task.
- Match existing patterns unless the task explicitly requires a new one.
- Do not refactor adjacent code, comments, or formatting as a drive-by edit.
- Clean up only unused code introduced by your own change unless asked.

## Goal-Driven Execution

- Turn vague requests into concrete success criteria.
- Verify behavior with tests or explicit checks whenever practical.
- Tie multi-step work to validation at each step.
- Do not claim completion without fresh evidence from the workspace.
