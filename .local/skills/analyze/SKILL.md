---
name: analyze
description: Deep analysis and investigation for bugs, architecture issues, and risk hotspots. Use when the user asks to analyze, investigate, debug, or explain why something is failing.
agent: debugger
---

# Analyze

Use this skill for evidence-driven investigation before implementation.

## Use When

- The user asks to analyze, investigate, debug, root-cause, or explain failures
- A fix has failed repeatedly and the team needs diagnosis first
- You need architecture or dependency impact analysis before making changes

## Workflow

1. Scope the target precisely.
2. Gather evidence:
   - Read relevant files and tests
   - Reproduce the issue when possible
   - Capture exact errors and stack traces
3. Build and test hypotheses:
   - Compare broken path vs working path
   - Trace control/data flow
   - Validate assumptions with commands
4. Conclude with ranked findings and concrete next actions.

## Debug Protocol

- Root-cause first. Do not jump to fixes.
- After 3 failed hypotheses, expand scope and challenge the initial assumption.
- Prefer user-observable behavior and reproducible evidence over speculation.

## Output Format

- Summary (2-3 sentences)
- Key findings (ranked by impact)
- Evidence (file references, command output, repro notes)
- Recommended next actions (minimal-risk order)

