---
name: skill-creator
description: Create new skills, modify and improve existing skills, and evaluate whether they route and behave correctly in OMC. Use when users want to create a skill from scratch, edit an existing skill, improve skill triggering, or iterate on a skill with prompt-based tests.
argument-hint: "<skill-goal-or-skill-path>"
metadata:
  short-description: Create or upgrade a skill
---

# Skill Creator

A skill for creating new skills and iteratively improving them.

This local version is based on the vendored Anthropic upstream file at `references/upstream-anthropic-skill-creator.md`, then adapted for OMC conventions and tooling.

## Adaptation Summary

- Upstream baseline: overall skill-creation loop, communication guidance, capture-intent flow, anatomy, progressive disclosure, and writing principles
- Local OMC adaptation: replaces upstream eval-viewer and benchmark workflow with `skill-quality-analyzer`, `skill-debugger`, and `skill-tester`
- Local OMC adaptation: keeps Claude Code-oriented metadata examples used in this repo
- Local OMC adaptation: confines project-specific orchestration fields such as `pipeline`, `next-skill`, and `handoff` to explicit local sections
- Maintenance rule: when upstream changes, update the vendored file first, then re-apply only the minimal OMC-specific differences

## Upstream Sync Policy

Treat `references/upstream-anthropic-skill-creator.md` as the authoritative upstream baseline for structure and intent.

When updating this local file:
- compare against the vendored upstream file first
- preserve the upstream section order unless there is a concrete local reason not to
- keep OMC-specific behavior in clearly labeled local sections
- do not silently replace upstream guidance with local conventions
- if upstream and OMC differ, prefer upstream for general skill-authoring advice and confine OMC differences to explicit adaptation notes

When Anthropic updates the upstream file:
1. refresh the vendored upstream copy
2. diff the upstream copy against this local file
3. pull forward structural and wording improvements that still fit OMC
4. re-check OMC-specific sections so they remain isolated and justified

At a high level, the process of creating a skill in OMC goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few realistic test prompts and run prompt-level checks
- Review the results both qualitatively and structurally
- Rewrite the skill based on what you learn
- Repeat until routing and behavior are stable
- Expand the test set and try again at larger scale if needed

Your job when using this skill is to figure out where the user is in this process and then help them move forward. Sometimes that means interviewing and drafting. Sometimes it means jumping straight to evaluation and revision.

After the draft exists, the normal OMC collaboration loop is:

1. `skill-quality-analyzer` for static review
2. `skill-debugger` for routing/configuration diagnosis
3. `skill-tester` for prompt-level verification
4. revise and repeat

## Communicating with the User

People using this skill may have very different levels of technical familiarity. Phrase things according to the user's level.

In the default case:
- "evaluation" and "benchmark" are usually acceptable
- terms like "JSON", "frontmatter", or "assertion" may need a brief explanation

Prefer short explanations over jargon when unsure.

## Creating a Skill

### Capture Intent

Start by understanding the user's intent. The current conversation may already contain the workflow the user wants to capture.

Extract from the conversation first:
- tools that were used
- sequence of steps
- corrections the user made
- input and output formats

Then fill the gaps:
1. What should this skill enable Claude to do?
2. When should this skill trigger?
3. What should the output or effect look like?
4. Should we set up prompt tests to verify the skill works?

Skills with objectively checkable outputs benefit from test cases. Purely subjective skills may need lighter evaluation.

### Interview and Research

Ask about:
- edge cases
- input and output formats
- example files
- success criteria
- dependencies
- nearby requests that should go elsewhere

Do not write test prompts until the intended boundaries are clear.

If outside research is useful, use primary sources and repo context first.

### Write the `SKILL.md`

Based on the interview, fill in:
- `name`
- `description`
- optional behavior metadata
- the actual instructions

The `description` is the primary discovery mechanism. It should say both what the skill does and when to use it.

Because skills tend to under-trigger, descriptions should be a little pushy. Do not make them vague taglines.

## Skill Writing Guide

### Anatomy of a Skill

```text
skill-name/
├── SKILL.md
├── Bundled Resources
│   ├── scripts/
│   ├── references/
│   └── assets/
└── agents/
    └── openai.yaml
```

#### `SKILL.md`

Every `SKILL.md` consists of:
- frontmatter
- markdown instructions

The main discovery surface is:
- `name`
- `description`

Recommended local frontmatter shape:

```yaml
---
name: skill-name
description: When to use the skill and what it does.
argument-hint: "<args>"
disable-model-invocation: false
user-invocable: true
allowed-tools:
  - Read
  - Grep
model: sonnet
---
```

#### Bundled Resources

##### `scripts/`

Use when the same code keeps getting rewritten or determinism matters.

##### `references/`

Use for documentation Claude should read only when needed.

##### `assets/`

Use for templates, icons, fonts, sample deliverables, and similar output resources.

#### What Not to Include in a Skill

A skill should contain the files needed for another agent to do the work, not extra process documentation.

Avoid adding:
- `README.md`
- `INSTALLATION_GUIDE.md`
- `QUICK_REFERENCE.md`
- `CHANGELOG.md`

### Progressive Disclosure

Skills use a three-level loading model:
1. metadata
2. `SKILL.md` body
3. bundled resources

Guidelines:
- keep `SKILL.md` compact
- split detail into `references/` before the file becomes hard to scan
- clearly point from `SKILL.md` to any follow-up files
- avoid deeply nested references

### Principle of Lack of Surprise

Skills must not contain malware, exploit code, or misleading behavior. The contents of the skill should match what the description leads a user to expect.

### Writing Patterns

Prefer imperative instructions.

Defining output formats:

```markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

Examples pattern:

```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

### Writing Style

Explain why important things matter instead of only piling up MUSTs. Prefer a draft-and-revise approach over trying to write the perfect skill in one pass.

## Test Cases

After writing the draft, come up with 2-3 realistic test prompts. Share them with the user or validate them yourself if the intent is already clear.

In OMC, prefer a prompt matrix with:
- obvious positive cases
- borderline positive cases
- obvious negative cases

The best negative cases are near-misses, not completely unrelated requests.

## Running and Evaluating Test Cases in OMC

This local adaptation does not rely on Anthropic's upstream benchmark viewer scripts as the primary workflow. Use the OMC toolchain instead.

### Step 1: Static Review

Run `skill-quality-analyzer` to inspect:
- discovery surface
- structure
- examples and eval coverage
- execution safety
- maintainability

### Step 2: Routing and Config Review

Run `skill-debugger` to inspect:
- under-triggering
- over-triggering
- name/description collisions
- metadata issues such as `disable-model-invocation`, `user-invocable`, and `allowed-tools`

### Step 3: Prompt-Level Verification

Run `skill-tester` with:
- positive prompts
- borderline prompts
- negative prompts

Check both selection and behavior after selection.

### Step 4: Revise

Bias revisions toward:
- tightening `description`
- narrowing overlap with neighboring skills
- fixing metadata that blocks routing
- bundling deterministic resources where repetition keeps appearing

### Step 5: Repeat Until Stable

Continue until:
- the skill triggers for clear in-scope prompts
- the skill stays quiet for clear out-of-scope prompts
- the body and bundled resources are proportionate to the task

## OMC-Specific Extensions

The upstream Anthropic file is the baseline. The fields below are local OMC extensions and should be treated as project-specific:

```yaml
pipeline: [skill-a, skill-b]
next-skill: skill-b
next-skill-args: --direct
handoff: .omc/plans/example.md
```

Use them only when this repository actually consumes them.

## Deliverables

A finished local skill should have:
- a valid `SKILL.md`
- a differentiated `description`
- justified bundled resources
- positive and negative prompt examples
- evidence from analyzer/debugger/tester passes

## Success Checklist

- [ ] skill package exists at `skills/<name>/SKILL.md`
- [ ] `name` matches the folder name
- [ ] `description` clearly says when to use the skill and what it does
- [ ] prompt matrix covers positive, borderline, and negative cases
- [ ] `skill-quality-analyzer` feedback addressed
- [ ] `skill-debugger` feedback addressed
- [ ] `skill-tester` feedback addressed
