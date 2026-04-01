# Skill Quality Analyzer

Static analysis skill for Claude Code skill packages.

This README reflects the current OMC model:
- `skill-creator` is the main authorship entrypoint
- vendored upstream Anthropic guidance is the baseline for upstream-derived skills
- `skill-quality-analyzer` scores the local package and flags drift, structure issues, and unclear adaptation boundaries

## Quick Install

```bash
# User-level
cp -r skill-quality-analyzer ~/.claude/skills/

# Project-level
cp -r skill-quality-analyzer .claude/skills/
```

## Usage

Once installed, Claude Code can use this skill when you ask about skill quality:

```text
Analyze the quality of my skill-creator skill
Generate a quality report for skill-debugger
Compare my local skill against the vendored upstream baseline
```

## What This Skill Does

Evaluates skills across 6 dimensions:

1. Discovery Surface
2. Structure
3. Examples / Evals
4. Execution Safety
5. Best Practices
6. Maintainability

For upstream-derived skills, it also checks whether the local file clearly distinguishes:
- upstream baseline guidance
- local OMC adaptations

## Output

- overall score (0-100)
- dimension-by-dimension breakdown
- severity-ranked issues
- prioritized recommendations

## Files

- `SKILL.md` - main skill definition
- `README.md` - quick overview
- `HOW_TO_USE.md` - examples and workflow details
- `sample_input.json` - sample target skill
- `expected_output.json` - sample output
- `analyzer.py` - optional hard-metrics helper

## Related Skills

- `skill-creator` - create or upgrade a skill
- `skill-debugger` - diagnose routing and configuration issues
- `skill-tester` - verify prompt-level behavior
