# Skill Debugger

Routing and configuration diagnosis skill for Claude Code skill packages.

This README reflects the current OMC workflow:
- `skill-creator` authors or upgrades the skill
- `skill-quality-analyzer` scores static quality
- `skill-debugger` explains why a skill is under-triggering, over-triggering, or misconfigured
- `skill-tester` verifies prompt-level behavior after fixes

## Quick Install

```bash
cp -r skill-debugger ~/.claude/skills/
```

## Usage

```text
Why is my code-review skill not triggering?
Debug why this skill keeps firing for the wrong prompts
Check whether this upstream-derived skill drifted away from its vendored baseline
```

## What It Does

- under-trigger diagnosis
- over-trigger diagnosis
- discovery debugging
- metadata debugging
- neighboring-skill conflict analysis
- upstream-drift checks for upstream-derived skills

## What It Checks

- `name` and `description`
- `disable-model-invocation`
- `user-invocable`
- `allowed-tools`
- overlap with nearby skills
- whether local adaptations are clearly separated from any vendored upstream baseline

## Files

- `SKILL.md` - main debugger workflow
- `README.md` - quick overview

## Related Skills

- `skill-creator` - author or structurally revise the skill
- `skill-quality-analyzer` - score static quality and adaptation boundaries
- `skill-tester` - verify prompt-level routing and behavior after fixes
