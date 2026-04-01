---
name: skill-quality-analyzer
description: Analyze the quality of a Claude Code skill across discovery, structure, safety, examples, and maintainability.
---

# Skill Quality Analyzer

Static analysis system for Claude Code skills. Identifies quality issues, scores the skill across six dimensions, and produces actionable recommendations before distribution.

## Workflow

1. Gather hard facts.
   - Does `SKILL.md` exist?
   - Are `name` and `description` present?
   - Are referenced `references/`, `scripts/`, and `assets/` files real?
   - Are behavior flags intentional?
   - If the skill declares or implies an upstream baseline, does the local file clearly differentiate upstream guidance from local adaptations?
2. Read the target skill semantically.
   - Is the promise clear?
   - Is the scope differentiated?
   - Is the workflow executable?
   - If a vendored upstream reference exists, does the local skill still track it where it should?
3. Synthesize a severity-ranked report.

If `analyzer.py` exists in this skill's directory, run it as the hard-metrics step:

```bash
python3 skills/skill-quality-analyzer/analyzer.py --skill-path /path/to/skill
```

## Output Formats

### Score Card

```json
{
  "overall_score": 85,
  "dimensions": {
    "discovery_surface": 90,
    "structure": 85,
    "examples_evals": 80,
    "execution_safety": 80,
    "best_practices": 85,
    "maintainability": 90
  }
}
```

### Report

Include:
- executive summary
- dimension breakdown
- severity-ranked issues
- prioritized recommendations

## Six Quality Dimensions

### 1. Discovery Surface (20%)

What it measures:
- distinct `name`
- clear `description`
- low overlap with neighboring skills

### 2. Structure (20%)

What it measures:
- valid frontmatter
- coherent section layout
- clean markdown structure

### 3. Examples / Evals (15%)

What it measures:
- positive examples
- negative or redirect examples
- borderline examples
- realistic prompt coverage

### 4. Execution Safety (15%)

What it measures:
- `disable-model-invocation` is correct
- `user-invocable` is correct
- `allowed-tools` is justified
- model/agent/context choices make sense

### 5. Best Practices (15%)

What it measures:
- Claude Code naming conventions
- proper package layout
- no misleading platform branding
- OMC-only metadata clearly treated as project-specific
- upstream-derived skills clearly identify what is baseline versus local adaptation

### 6. Maintainability (15%)

What it measures:
- modular skill package
- low clutter
- references split before the skill becomes hard to scan
- sustainable file organization

## How to Use

### Basic

```text
Analyze the quality of my skill-creator skill
Run quality analysis on skills/skill-debugger/
```

### Detailed

```text
Generate a detailed quality report for skill-tester
Compare skill-creator and skill-debugger against current best practices
```

### Batch

```text
Analyze all skills in skills/ and rank them by quality
```

## Recommended Pipeline

1. `skill-creator`
2. `skill-quality-analyzer`
3. `skill-debugger`
4. `skill-tester`

## Best Practices

1. Analyze before distribution
2. Target 80+ for production skills
3. Fix critical issues first
4. Compare against current official examples, not only local tradition
5. For upstream-derived skills, compare against the vendored upstream baseline before scoring local adaptations
6. Re-run after meaningful edits

## Limitations

- Static analysis cannot prove routing behavior
- Prompt-level behavior still needs `skill-tester`
- Human judgment is still required for overlap and scope

## When NOT to Use This Skill

- For root-cause analysis of why a skill is not selected, use `skill-debugger`
- For prompt-level verification, use `skill-tester`
- For first-draft authoring or upgrades, use `skill-creator`
