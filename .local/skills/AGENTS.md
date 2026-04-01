<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-01-28 | Updated: 2026-03-12 -->

# skills

30 skill directories for workflow automation and specialized behaviors.

## Purpose

Skills are reusable workflow templates authored as Claude Code skill packages. In OMC they are commonly invoked via `/oh-my-claudecode:skill-name`, but they should still be written as standard `SKILL.md` packages first. Each skill provides:
- structured prompts for specific workflows
- activation triggers (manual or automatic)
- integration with execution modes

## Key Files

### Execution Mode Skills

| File | Skill | Purpose |
|-----------|-------|---------|
| `autopilot/SKILL.md` | autopilot | Full autonomous execution from idea to working code |
| `ultrawork/SKILL.md` | ultrawork | Maximum parallel agent execution |
| `ralph/SKILL.md` | ralph | Persistence until verified complete |
| `team/SKILL.md` | team | N coordinated agents with task claiming |
| `ultraqa/SKILL.md` | ultraqa | QA cycling until goal met |

### Planning Skills

| File | Skill | Purpose |
|-----------|-------|---------|
| `plan/SKILL.md` | omc-plan | Strategic planning with interview workflow |
| `ralplan/SKILL.md` | ralplan | Iterative planning (Planner+Architect+Critic) with RALPLAN-DR structured deliberation (`--deliberate` for high-risk) |
| `deep-interview/SKILL.md` | deep-interview | Socratic deep interview with mathematical ambiguity gating (Ouroboros-inspired) |
| `ralph-init/SKILL.md` | ralph-init | Initialize PRD for structured ralph |
| `quick-init-project/SKILL.md` | quick-init-project | Intelligent project bootstrap with mode selection (fullstack/frontend/backend/demo) and data-driven tech stack recommendations |

### Exploration Skills

| File | Skill | Purpose |
|-----------|-------|---------|
| `deepinit/SKILL.md` | deepinit | Generate hierarchical AGENTS.md |
| `sciomc/SKILL.md` | sciomc | Parallel scientist orchestration |

### Visual Skills

| File | Skill | Purpose |
|-----------|-------|---------|
| `visual-verdict/SKILL.md` | visual-verdict | Structured visual QA verdict for screenshot/reference comparisons |

### Utility Skills

| File | Skill | Purpose |
|-----------|-------|---------|
| `ai-slop-cleaner/SKILL.md` | ai-slop-cleaner | Regression-safe cleanup workflow for AI-generated code slop |
| `learner/SKILL.md` | learner | Extract reusable skill from session |
| `ask/SKILL.md` | ask | Ask Claude, Codex, or Gemini via `omc ask` and capture an artifact |
| `note/SKILL.md` | note | Save notes for compaction resilience |
| `cancel/SKILL.md` | cancel | Cancel any active OMC mode |
| `hud/SKILL.md` | hud | Configure HUD display |
| `omc-doctor/SKILL.md` | omc-doctor | Diagnose installation issues |
| `setup/SKILL.md` | setup | Unified setup entrypoint for install, diagnostics, and MCP configuration |
| `omc-setup/SKILL.md` | omc-setup | One-time setup wizard |
| `omc-help/SKILL.md` | omc-help | Usage guide |
| `mcp-setup/SKILL.md` | mcp-setup | Configure MCP servers |
| `skill-creator/SKILL.md` | skill-creator | Create or upgrade Claude Code skill packages |
| `skill/SKILL.md` | skill | Manage local skills |

### Domain Skills

| File | Skill | Purpose |
|-----------|-------|---------|
| `project-session-manager/SKILL.md` | project-session-manager (+ `psm` alias) | Isolated dev environments |
| `writer-memory/SKILL.md` | writer-memory | Agentic memory for writers |
| `release/SKILL.md` | release | Automated release workflow |

## For AI Agents

### Working In This Directory

Upstream baseline for skill authorship:
- `skills/skill-creator/references/upstream-anthropic-skill-creator.md`

Local policy:
- follow the upstream Anthropic structure first
- add OMC-specific extensions second
- default to the vendored upstream file when in doubt
- treat `skills/skill-creator/SKILL.md` as the local adaptation layer, not the upstream source

Mandatory rule for skill authorship work:
- do not invent a new skill template from scratch if the vendored upstream baseline already covers the shape
- deviations from upstream must be explicit, minimal, and justified by OMC runtime behavior
- if a local rule is not clearly OMC-specific, it should be aligned back toward the vendored upstream wording

#### Skill Template Format

Write new skills in two layers:
- official-style skeleton first
- OMC extension block second, only if needed
- use `skills/skill-creator/references/upstream-anthropic-skill-creator.md` as the default skeleton source

```markdown
---
name: skill-name
description: Short, explicit statement of when to use the skill and what it does
argument-hint: "<args>"          # Optional Claude Code field
disable-model-invocation: false  # Optional Claude Code field
user-invocable: true             # Optional Claude Code field
allowed-tools:                   # Optional Claude Code field
  - Read
model: sonnet                    # Optional Claude Code field
---

# Skill Name

## About Skills / Purpose
What the skill enables and why it exists.

## Core Principles
Concise guidance, correct level of specificity, and minimal package shape.

## Anatomy of a Skill
Explain when `scripts/`, `references/`, and `assets/` are justified.

## Progressive Disclosure
Keep `SKILL.md` compact and move heavy detail into `references/`.

## Skill Creation Process
1. Understand the skill with concrete examples
2. Plan reusable contents
3. Initialize the skill package
4. Write `SKILL.md`
5. Validate the skill
6. Iterate from real usage
```

#### OMC Extension Block

If the skill needs OMC-specific orchestration metadata, append it after the official skeleton as a clearly project-specific extension:

```yaml
pipeline: [skill-name, follow-up-skill]  # Optional OMC extension
next-skill: follow-up-skill              # Optional OMC extension
next-skill-args: --direct                # Optional OMC extension
handoff: .omc/plans/example.md           # Optional OMC extension
```

Keep the distinction clear:
- official Claude Code defaults: `name`, `description`, and optional behavior fields
- OMC extensions: `pipeline`, `next-skill`, `next-skill-args`, `handoff`

#### Skill Invocation

```bash
# Manual invocation
/oh-my-claudecode:skill-name

# With arguments
/oh-my-claudecode:skill-name arg1 arg2

# Auto-detected from keywords
"autopilot build me a REST API"
```

#### Creating or Replacing a Skill

1. Create `new-skill/SKILL.md` with YAML frontmatter
2. Read `skills/skill-creator/references/upstream-anthropic-skill-creator.md`
3. Use the upstream Anthropic skeleton first: about, principles, anatomy, progressive disclosure, creation process
4. Check `skills/skill-creator/SKILL.md` for the local OMC adaptation rules
5. Add only the bundled resources that are justified
6. Add OMC-specific metadata only if this repo will consume it
7. Create `commands/new-skill.md` only if you need legacy command compatibility
8. Update `docs/REFERENCE.md` if the user-facing catalog changed
9. If it is an execution-mode skill, also create the related `src/hooks/` logic
10. Route authorship work through `skill-creator`, then hand off to `skill-quality-analyzer`, `skill-debugger`, and `skill-tester`

### Common Patterns

Skill chaining:

```markdown
## Workflow
1. Invoke `explore` for context
2. Invoke `architect` for analysis
3. Invoke `executor` for implementation
4. Invoke `qa-tester` for verification
```

If `pipeline` or `next-skill` metadata is present, OMC appends a standardized handoff block to the rendered prompt so downstream steps are explicit.

Official skeleton first, OMC extension second:
- first write the skill as a normal Claude Code package based on the upstream Anthropic structure
- then add OMC orchestration metadata only if the project needs it

Default reference order:
1. `skills/skill-creator/references/upstream-anthropic-skill-creator.md`
2. `skills/skill-creator/SKILL.md`
3. local neighboring skills for examples

### Testing Requirements

- skills are verified via integration tests
- test invocation with `/oh-my-claudecode:skill-name`
- verify positive and negative prompt cases
- verify any invocation flags or tool restrictions
- for git-related skills, follow `templates/rules/git-workflow.md`

## Dependencies

### Internal

- loaded by the skill bridge
- references agents from `agents/`
- may use hooks from `src/hooks/`

### External

None - pure markdown files by default.

## Skill Categories

| Category | Skills | Trigger Keywords |
|----------|--------|------------------|
| Execution | autopilot, ultrawork, ralph, team, ultraqa | "autopilot", "ulw", "ralph", "team" |
| Cleanup | ai-slop-cleaner | "deslop", "anti-slop", cleanup/refactor + slop smells |
| Planning | omc-plan, ralplan, deep-interview, ralph-init | "plan", "interview", "ouroboros" |
| Exploration | deepinit, sciomc, external-context | "deepinit", "research" |
| Utility | learner, note, cancel, hud, setup, omc-doctor, omc-setup, omc-help, mcp-setup, skill-creator | "stop", "cancel", "create skill" |
| Domain | psm, writer-memory, release | context-specific |
