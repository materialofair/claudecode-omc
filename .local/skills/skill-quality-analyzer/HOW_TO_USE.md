# How to Use Skill Quality Analyzer

## Basic Usage

### Single Skill Analysis

```text
Analyze the quality of my skill-creator skill
Check the quality score for skills/skill-debugger/
Generate a quality report for skills/skill-tester/
```

What Claude will do:
1. Read the skill package
2. Inspect discovery surface, structure, and examples
3. Check execution-safety metadata
4. Report issues and recommendations

### Upstream-Derived Skill Analysis

```text
Compare my local skill-creator against its vendored upstream baseline
Check whether this upstream-derived skill still isolates local OMC adaptations correctly
```

What Claude will check:
- whether the local file still tracks the baseline where it should
- whether local adaptations are clearly marked
- whether project-specific metadata leaked into general guidance

## Detailed Report

```text
Generate a detailed quality report for skill-debugger
Analyze skill-creator and tell me what to tighten before the next upstream sync
```

Output includes:
- overall score
- dimension scores
- severity-ranked issues
- prioritized fixes

## Batch Usage

```text
Analyze all skills in skills/ and rank them by quality
Which skill packages have the weakest discovery surfaces?
Which upstream-derived skills have drifted the most?
```

## Understanding the Output

### Overall Score

| Score | Quality Level | Meaning |
|-------|---------------|---------|
| 90-100 | Excellent | Ready as an example or stable local standard |
| 80-89 | Good | Minor improvements needed |
| 70-79 | Acceptable | Fix important issues before relying on it widely |
| 60-69 | Needs Work | Significant revisions needed |
| <60 | Poor | Major refactoring needed |

### Six Dimensions

#### 1. Discovery Surface

- Is the `name` distinct?
- Does the `description` say when to use the skill and what it does?
- Is the scope differentiated from neighboring skills?

#### 2. Structure

- Is frontmatter valid?
- Is the file organized coherently?
- Are major sections present and readable?

#### 3. Examples / Evals

- Are there positive examples?
- Are there negative or redirect examples?
- Are examples realistic?

#### 4. Execution Safety

- Are `disable-model-invocation`, `user-invocable`, and `allowed-tools` intentional?
- Are model or agent choices justified?

#### 5. Best Practices

- Does the package follow Claude Code conventions?
- Is misleading platform branding avoided?
- If upstream-derived, is baseline vs local adaptation clearly separated?

#### 6. Maintainability

- Is the package easy to evolve?
- Is the structure low-clutter?
- Have large details been split before the main file became noisy?

## Example Outcomes

### Example 1: Healthy Local Skill

```text
Overall Score: 88 (Good)

Strengths:
- Clear discovery surface
- Good structure
- Strong adaptation boundaries

Improvements:
- Add more borderline prompt examples
- Tighten one overlapping use case with a neighboring skill
```

### Example 2: Upstream Drift

```text
Issue:
Local skill still points to an upstream baseline, but several sections replaced baseline guidance instead of isolating OMC-specific behavior.

Recommendation:
- restore baseline-oriented guidance
- move local runtime-specific behavior into explicit OMC adaptation sections
```

## Recommended Workflow

1. Author or revise with `skill-creator`
2. Run `skill-quality-analyzer`
3. If routing is unclear, run `skill-debugger`
4. Run `skill-tester` for prompt-level verification
5. Revise and re-run

## Tips

1. Use this skill before sharing or standardizing a skill
2. For upstream-derived skills, always compare against the vendored baseline
3. Treat scores below 80 as a sign to inspect the report, not just the number
4. Fix discovery-surface problems before polishing wording elsewhere

## Troubleshooting

Q: The score seems harsh.
A: It is intentionally strict on discovery clarity and adaptation boundaries because those are easy places for skills to rot.

Q: Should this skill replace `skill-debugger`?
A: No. Use this for static quality. Use `skill-debugger` for root-cause diagnosis of routing or configuration failures.
