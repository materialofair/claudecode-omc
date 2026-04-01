# Skill Tester

Prompt-level testing skill for Claude Code skill packages.

This README reflects the current OMC workflow:
- `skill-creator` writes or updates the skill
- `skill-quality-analyzer` checks static quality
- `skill-debugger` diagnoses routing/configuration problems
- `skill-tester` verifies prompt-level behavior

## Quick Install

```bash
cp -r skill-tester ~/.claude/skills/
```

## Usage

```text
Test if skill-debugger triggers for under-triggering requests
Run a full prompt suite on skill-creator
Check whether this upstream-derived skill still behaves correctly after local OMC adaptations
```

## What It Does

- discovery testing
- negative testing
- execution testing
- integration testing
- metadata edge-case testing
- upstream-conformance testing for upstream-derived skills

## Recommended Prompt Matrix

Use:
- obvious positive prompts
- borderline prompts
- obvious negative prompts

For upstream-derived skills, also test:
- baseline-conformance cases
- local-adaptation cases

## Files

- `SKILL.md` - main testing workflow
- `README.md` - quick overview

## Related Skills

- `skill-creator` - create or revise the skill
- `skill-quality-analyzer` - score static quality
- `skill-debugger` - diagnose why routing or configuration is wrong
