---
name: prompt-optimizer
description: >-
  Analyze raw prompts, identify intent and gaps, match ECC components
  (skills/commands/agents/hooks), and output a ready-to-paste optimized
  prompt. Advisory role only — never executes the task itself.
  TRIGGER when: user says "optimize prompt", "improve my prompt",
  "how to write a prompt for", "help me prompt", "rewrite this prompt",
  or explicitly asks to enhance prompt quality. Also triggers on Chinese
  equivalents: "优化prompt", "改进prompt", "怎么写prompt", "帮我优化这个指令".
  Specially handles short Chinese bug reports (the dominant real-world use
  case): runs Bug Report Triage to extract repro/expected/actual/environment,
  asks up to 3 clarifying questions if ≤ 2 fields are present, and inserts
  systematic-debugging as a hard prerequisite before any code change.
  DO NOT TRIGGER when: user wants the task executed directly, or says
  "just do it" / "直接做". DO NOT TRIGGER when user says "优化代码",
  "优化性能", "optimize performance", "optimize this code" — those are
  refactoring/performance tasks, not prompt optimization (unless the user
  explicitly invokes /prompt-optimize, in which case treat them as
  Bug Fix + Refactor combined).
origin: community
metadata:
  author: YannJY02
  version: "1.2.0"
  changelog: |
    1.2.0 — Skill Existence & Alias Resolution (Phase 0.5) so we stop
            recommending phantom skills (`tdd-workflow`, `search-first`,
            `blueprint`, `tdd-guide` agent, etc. that don't exist on most
            installs). Multi-Intent Detection in Phase 1 with structured
            patterns and scope-bump rule. Conductor scope-gating column
            in Phase 2 (TRIVIAL/LOW skip, MEDIUM optional, HIGH default,
            EPIC required) — prevents over-ceremonialized small tasks.
            Best-Practices Skill Chains subsection in Phase 3 documenting
            the superpowers pipeline per intent (New Feature, Bug Fix,
            Performance, Research-then-Build, Multi-Intent, Refactor).
    1.1.0 — Added Bug Report Triage (Phase 1.5), Compact Mode (Phase 6),
            Tauri/Electron tech stacks, Research-then-Build intent,
            Performance intent, conductor/systematic-debugging/trace/analyze
            in component matching, real-data Chinese bug example.
            Driven by 8 real /prompt-optimize invocations: 7/8 were Chinese
            bug reports, 1/8 was research-then-build.
    1.0.0 — Initial release.
---

# Prompt Optimizer

Analyze a draft prompt, critique it, match it to ECC ecosystem components,
and output a complete optimized prompt the user can paste and run.

## When to Use

- User says "optimize this prompt", "improve my prompt", "rewrite this prompt"
- User says "help me write a better prompt for..."
- User says "what's the best way to ask Claude Code to..."
- User says "优化prompt", "改进prompt", "怎么写prompt", "帮我优化这个指令"
- User pastes a draft prompt and asks for feedback or enhancement
- User says "I don't know how to prompt for this"
- User says "how should I use ECC for..."
- User explicitly invokes `/prompt-optimize`

### Do Not Use When

- User wants the task done directly (just execute it)
- User says "优化代码", "优化性能", "optimize this code", "optimize performance" — these are refactoring tasks, not prompt optimization
- User is asking about ECC configuration (use `configure-ecc` instead)
- User wants a skill inventory (use `skill-stocktake` instead)
- User says "just do it" or "直接做"

## How It Works

**Advisory only — do not execute the user's task.**

Do NOT write code, create files, run commands, or take any implementation
action. Your ONLY output is an analysis plus an optimized prompt.

If the user says "just do it", "直接做", or "don't optimize, just execute",
do not switch into implementation mode inside this skill. Tell the user this
skill only produces optimized prompts, and instruct them to make a normal
task request if they want execution instead.

Run this 6-phase pipeline sequentially. Present results using the Output Format below.

### Analysis Pipeline

### Phase 0: Project Detection

Before analyzing the prompt, detect the current project context:

1. Check if a `CLAUDE.md` exists in the working directory — read it for project conventions
2. Detect tech stack from project files:
   - `package.json` → Node.js / TypeScript / React / Next.js
   - `go.mod` → Go
   - `pyproject.toml` / `requirements.txt` → Python
   - `Cargo.toml` → Rust
   - `src-tauri/` + `Cargo.toml` + `package.json` → **Tauri** (Rust core + Web frontend)
   - `electron.json` / `electron-builder.json` / `electron` in `package.json` deps → **Electron**
   - `expo.json` / `app.json` with Expo SDK → React Native (Expo)
   - `build.gradle` / `pom.xml` → Java / Kotlin / Spring Boot
   - `Package.swift` → Swift
   - `Gemfile` → Ruby
   - `composer.json` → PHP
   - `*.csproj` / `*.sln` → .NET
   - `Makefile` / `CMakeLists.txt` → C / C++
   - `cpanfile` / `Makefile.PL` → Perl
3. **Git context auto-pull** — if the user's prompt mentions `当前分支` / `current branch` / `this PR` / `本次改动`, run these read-only commands and inject results into Phase 4 context:
   - `git status --short` (uncommitted changes)
   - `git log -5 --oneline` (recent commits)
   - `git diff --stat HEAD~1` (latest commit's surface area)
   This converts vague references into concrete file lists.
4. Note detected tech stack for use in Phase 3 and Phase 4

If no project files are found (e.g., the prompt is abstract or for a new project),
skip detection and flag "tech stack unknown" in Phase 4.

### Phase 0.5: Skill Existence & Alias Resolution

The component tables below were authored against a generic ECC distribution.
Many users run OMC, superpowers, or their own custom installs where the same
capability lives under a **different skill name**. Recommending a phantom skill
wastes the user's time.

**Preferred check (live index):** before listing a skill in Section 2 / Section 3,
read the auto-generated catalog:

```
cat ~/.claude/skills/_index.md
```

This file is regenerated by `omc-manage setup` (or manually via
`omc-manage skill index`) and contains one row per installed skill with its
`name | description`. Grep it for keywords from the user's intent:

```
grep -i "test\|tdd\|verification" ~/.claude/skills/_index.md
```

If a recommended skill does **not** appear in `_index.md`, replace it with a
matching installed skill or fall back to the alias table below.

**Fallback rule (when index is missing or empty):** mentally check
*"Is this skill likely installed locally?"* If unsure, follow the alias table
or add a verification note.

**Common alias map (generic ECC name → likely real names):**

| Generic ECC name | superpowers / OMC actual | Verification |
|---|---|---|
| `tdd-workflow` (skill) | `test-driven-development` (superpowers) OR `tdd-generator` (OMC) | `ls ~/.claude/skills/test-driven-development` |
| `verification-loop` (skill) | `verification-before-completion` (superpowers) OR `verification-loop` (OMC) | both common |
| `search-first` (skill) | `external-context` OR `iterative-retrieval` | check both |
| `blueprint` (skill) | **`conductor`** (preferred multi-session driver) | `ls ~/.claude/skills/conductor` |
| `e2e-testing` (skill) | `e2e` | — |
| `tdd-guide` (agent) | `test-engineer` (OMC) | — |
| `build-error-resolver` (agent) | `debugger` (OMC) | — |
| `refactor-cleaner` (agent) | `code-simplifier` (OMC) | — |
| `doc-updater` (agent) | `writer` (OMC) | — |
| `python-reviewer` / `go-reviewer` / etc. | usually just `code-reviewer` | — |

**Tech-stack-specific patterns** (`django-patterns`, `springboot-patterns`,
`frontend-patterns`, etc., listed in the By Tech Stack table) are **aspirational
on most installs** — assume absent unless the user confirms otherwise. When
referencing them in Section 3, write:

> If you don't have `<skill-name>` installed, recommend the universal `coding-standards` skill instead, or use the conventions in the project's `CLAUDE.md`.

**Discovery shortcut for the user:** if `_index.md` is missing entirely, suggest
they run `omc-manage skill index --scope user` (or just `omc-manage setup`,
which regenerates it as a side effect). For a quality audit, use
`/oh-my-claudecode:skill-stocktake`.

### Phase 1: Intent Detection

Classify the user's task into one or more categories:

| Category | Signal Words | Example |
|----------|-------------|---------|
| New Feature | build, create, add, implement, 创建, 实现, 添加, 增加 | "Build a login page" |
| Bug Fix | fix, broken, not working, error, 修复, 报错, 偶现, 不工作, 失效, 卡顿, 我发现一个问题, 你先看看 | "Fix the auth flow" / "我发现头像不显示" |
| Refactor | refactor, clean up, restructure, 重构, 整理 | "Refactor the API layer" |
| Research | how to, what is, explore, investigate, 怎么, 如何 | "How to add SSO" |
| **Research-then-Build** | "先调研 X 再实现", "参考 X 怎么做", "look at how X does it then build" | "先调研 Gemini CLI 自动补全再实现" |
| Testing | test, coverage, verify, 测试, 覆盖率 | "Add tests for the cart" |
| Review | review, audit, check, 审查, 检查 | "Review my PR" |
| Documentation | document, update docs, 文档 | "Update the API docs" |
| Infrastructure | deploy, CI, docker, database, 部署, 数据库 | "Set up CI/CD pipeline" |
| Design | design, architecture, plan, 设计, 架构 | "Design the data model" |
| Performance | "优化性能", "卡顿", "slow", "latency", "做性能优化" | "Windows 上卡顿" |

**Multi-intent prompts** (detect at this phase, plan in Phase 2):

Many real prompts pack ≥ 2 intents into one sentence. Detect by counting
distinct verbs/categories. Common patterns:

| Pattern | Example | Intents |
|---|---|---|
| "先 X 再 Y" | "先做性能优化，再做 UX 优化" | Performance → Refactor |
| "X 同时 Y" | "修复 bug 同时加一个新页面" | Bug Fix + New Feature |
| "顺便/也" | "改这个 bug，顺便补测试" | Bug Fix + Testing |
| "调研 X 然后实现" | "调研 Gemini CLI 自动补全再实现" | Research-then-Build |
| "重构 X 顺便加 Y" | "重构 API 顺便补文档" | Refactor + Documentation |

**When ≥ 2 distinct intents detected:**

1. **Do not collapse into a single prompt.** That produces ambiguous task
   ordering and loses scope discipline.
2. **Bump scope assessment by one level** (e.g., MEDIUM → HIGH). Multi-intent
   work has higher coordination cost than single-intent.
3. **Recommend the conductor skill** if combined scope is HIGH or above —
   each intent becomes a track:
   ```
   .omc/conductor/<feature-name>/
   ├── tracks/
   │   ├── perf-optimization/      # spec → plan → review
   │   └── ux-improvement/         # spec → plan → review
   ```
4. **Order matters**: explicit "先 X 再 Y" is sequential; "X + Y" with no
   ordering signal — recommend a default order based on dependency
   (e.g., investigation before fix, fix before refactor, refactor before docs).
5. **Stop conditions per intent**: each track gets its own /verify gate; do
   NOT proceed to track 2 until track 1's verify passes.

**Note on Performance intent**: The skill's "Do Not Use When" rule blocks `优化性能` *as a trigger* — but if the user explicitly invoked `/prompt-optimize` with a performance task, treat it like Bug Fix + Refactor combined: investigate first (`analyze`/`trace`), then refactor with measurement gates.

### Phase 1.5: Bug Report Triage (only if Intent = Bug Fix or Performance)

Bug reports are the highest-volume use case for this skill, and they fail in
predictable ways: vague repro, missing environment, no expected/actual.
For Bug Fix and Performance intents, you MUST score the prompt against this
checklist before generating the optimized prompt.

| Field | What to extract | Default if missing |
|---|---|---|
| **Repro steps** | Concrete numbered steps to trigger the bug | Mark `TODO: 用户补充复现步骤` |
| **Expected behavior** | What should happen | Infer from prompt or mark TODO |
| **Actual behavior** | What does happen (error message, screenshot, log) | Mark TODO |
| **Environment** | OS (macOS/Windows/Linux), version, browser, device | Ask if absent and prompt mentions cross-platform symptoms |
| **Reproducibility** | 100% / 偶现 (intermittent) / "first time" | Default 100% if not stated |
| **Recent changes** | Branch name, recent commits, suspected commit | Auto-fill via `git log -5` (Phase 0) |
| **Logs / stack trace** | Error text, console output, network response | Mark `TODO: 粘贴完整错误日志/截图` |

**Scoring rule:**
- ≥ 5 fields present → proceed to Phase 2 directly
- 3–4 fields present → fill TODO markers in optimized prompt; do NOT block
- ≤ 2 fields present → ask the user up to 3 clarifying questions BEFORE generating prompt. Prioritize: (1) repro, (2) environment if "偶现"/"intermittent"/cross-platform mentioned, (3) actual error/log

**Special signals:**
- "偶现" / "intermittent" / "flaky" / "sometimes" / "occasionally" → MUST ask: trigger pattern, frequency, environment differences
- "X 平台正常 Y 平台不正常" / "works on mac, broken on windows" → cross-platform Bug; recommend `electron-driver` skill if Electron, recommend platform-conditional repro
- "重启后/restart" → state-persistence bug; recommend reading any storage layer (localStorage, electron-store, Tauri store, sqlite) before fixing
- "性能/slow/卡顿" → Performance intent; recommend `analyze` skill + measurement-first workflow (record baseline, then optimize)

**Bug Fix optimized-prompt template** (used in Section 3 when intent = Bug Fix):

```
## 问题描述
[symptom in 1-2 sentences]

## 复现步骤
1. ...
2. ...
3. ...

## 期望 vs 实际
- 期望：...
- 实际：...

## 环境
- OS / 版本：[macOS 14 / Windows 11 / ...]
- 复现率：[100% / 偶现 N 次/M 次]
- 当前分支：[auto-filled via git]
- 相关日志：[paste here / TODO]

## 工作流
1. **不要直接改代码**。先用 systematic-debugging skill 定位根因
   - 列出至少 3 个候选假设
   - 对每个假设设计最小验证（添加日志 / 阅读相关代码）
2. /tdd 写一个 failing 测试复现 bug（如果是 UI bug，写 e2e 用例）
3. 修复到 green
4. /verify 跨平台验证（如适用，跑 macOS + Windows）
5. /code-review

## 不要做
- 不要重构相邻无关代码
- 不要修改无关文件
- 不要在没有定位根因前提交"试试看"的修复
```

### Phase 2: Scope Assessment

If Phase 0 detected a project, use codebase size as a signal. Otherwise, estimate
from the prompt description alone and mark the estimate as uncertain.

| Scope | Heuristic | Orchestration | **Conductor recommendation** |
|-------|-----------|---------------|------------------------------|
| TRIVIAL | Single file, < 50 lines | Direct execution | **Skip** — overkill |
| LOW | Single component or module | Single command or skill | **Skip** — single skill is enough |
| MEDIUM | Multiple components, same domain | Command chain + /verify | **Optional** — offer it but don't force; user choice |
| HIGH | Cross-domain, 5+ files | /plan first, then phased execution | **Default ON** — `conductor` track keeps phases coherent across reviews |
| EPIC | Multi-session, multi-PR, architectural shift | conductor (or blueprint) for multi-session plan | **Required** — single-session execution will lose context |

**Why the gating matters:** Recommending conductor for a TRIVIAL task ("rename
this variable") creates `.omc/conductor/<track>/spec.md` etc. — pure ceremony
overhead. Conductor's value (durable spec/plan/review across sessions) only
pays off when the task itself is durable (HIGH+).

**Multi-intent override**: per Phase 1, multi-intent prompts bump scope by
one level. So a MEDIUM task with 2 intents → HIGH → conductor defaults ON.

### Phase 3: ECC Component Matching

Map intent + scope + tech stack (from Phase 0) to specific ECC components.

#### By Intent Type

| Intent | Commands | Skills | Agents |
|--------|----------|--------|--------|
| New Feature | /plan, /tdd, /code-review, /verify | tdd-workflow, verification-loop | planner, tdd-guide, code-reviewer |
| **Bug Fix** | /tdd, /verify | **systematic-debugging (REQUIRED first)**, trace, analyze, debug, verification-loop | **debugger**, tdd-guide, code-reviewer |
| **Bug Fix (intermittent / 偶现)** | /verify | systematic-debugging, trace, **e2e (for flaky reproduction harness)** | debugger, tracer |
| **Bug Fix (cross-platform)** | /verify | systematic-debugging, **electron-driver** (if Electron) | debugger, code-reviewer |
| **Performance** | /verify | analyze, trace, verification-loop | architect, code-reviewer |
| Refactor | /refactor-clean, /code-review, /verify | verification-loop | refactor-cleaner, code-reviewer |
| Research | /plan | search-first, iterative-retrieval, external-context | — |
| **Research-then-Build** | /plan | external-context (research) → **conductor** (track delivery) → /tdd per phase | planner → executor |
| Testing | /tdd, /e2e, /test-coverage | tdd-workflow, e2e-testing | tdd-guide, e2e-runner |
| Review | /code-review | security-review | code-reviewer, security-reviewer |
| Documentation | /update-docs, /update-codemaps | — | doc-updater, writer |
| Infrastructure | /plan, /verify | docker-patterns, deployment-patterns, database-migrations | architect |
| Design (MEDIUM-HIGH) | /plan | — | planner, architect |
| Design (EPIC) | — | **conductor** (multi-session track) OR blueprint | planner, architect |

#### By Tech Stack

| Tech Stack | Skills to Add | Agent |
|------------|--------------|-------|
| Python / Django | django-patterns, django-tdd, django-security, django-verification, python-patterns, python-testing | python-reviewer |
| Go | golang-patterns, golang-testing | go-reviewer, go-build-resolver |
| Spring Boot / Java | springboot-patterns, springboot-tdd, springboot-security, springboot-verification, java-coding-standards, jpa-patterns | code-reviewer |
| Kotlin / Android | kotlin-coroutines-flows, compose-multiplatform-patterns, android-clean-architecture | kotlin-reviewer |
| TypeScript / React | frontend-patterns, backend-patterns, coding-standards | code-reviewer |
| Swift / iOS | swiftui-patterns, swift-concurrency-6-2, swift-actor-persistence, swift-protocol-di-testing | code-reviewer |
| **Tauri (Rust + Web)** | rust-patterns, frontend-patterns, coding-standards (note IPC bridge between Rust core and Web) | code-reviewer |
| **Electron** | **electron-driver (E2E)**, frontend-patterns, coding-standards (note main vs renderer process) | code-reviewer |
| **React Native / Expo** | frontend-patterns, coding-standards | code-reviewer |
| **Cross-platform desktop bug** | electron-driver (if Electron) + systematic-debugging + platform-conditional repro | debugger |
| PostgreSQL | postgres-patterns, database-migrations | database-reviewer |
| Perl | perl-patterns, perl-testing, perl-security | code-reviewer |
| C++ | cpp-coding-standards, cpp-testing | code-reviewer |
| Other / Unlisted | coding-standards (universal) | code-reviewer |

#### Best-Practices Skill Chains

The two tables above pick **single skills**; this subsection wires them into
**ordered chains** that match documented community best practices (primarily
the superpowers pipeline). Use these chains in Section 3 — don't just dump a
flat list of skills.

**Chain notation:** `A → B → C` means run A first, then B, then C, with each
step gated by its own success criterion. `[X]` = optional, include only if
scope/risk warrants it.

##### Chain: New Feature (HIGH+ scope)

```
brainstorming                       (clarify intent + requirements)
  → using-git-worktrees             (isolate work)
  → conductor (init track)          (create spec.md / plan.md skeleton)
    → writing-plans                 (fill plan.md with concrete steps)
    → [research] external-context   (only if novel domain)
    → test-driven-development       (red → green per step)
    → verification-before-completion (evidence-based check)
    → requesting-code-review        (independent review pass)
  → finishing-a-development-branch  (merge / PR / cleanup)
```

##### Chain: New Feature (LOW–MEDIUM scope, no conductor)

```
brainstorming
  → writing-plans                   (lightweight inline plan)
  → test-driven-development
  → verification-before-completion
  → [requesting-code-review]        (skip for trivial)
```

##### Chain: Bug Fix (any scope)

```
systematic-debugging                (REQUIRED: hypotheses → evidence)
  → [trace]                         (only if intermittent / 偶现)
  → test-driven-development         (failing test reproduces bug)
  → verification-before-completion  (test passes + no regressions)
  → [requesting-code-review]        (for non-trivial fixes)
  → finishing-a-development-branch
```

##### Chain: Performance Optimization

```
analyze                             (baseline measurement: profile / timing)
  → trace                           (locate hotspot with evidence)
  → writing-plans                   (which optimizations, in what order)
  → test-driven-development         (regression test for behavior)
  → [implement]                     (one optimization at a time)
  → verification-before-completion  (re-measure: did it actually improve?)
  → finishing-a-development-branch
```

##### Chain: Research-then-Build

```
external-context                    (study reference implementation)
  → produce comparison report       (what to copy, what to skip, what to adapt)
  → brainstorming                   (apply learnings to our context)
  → conductor (init multi-phase track)
    → phase-1: minimal viable port
    → phase-2: project-specific adaptations
    → phase-3: integration + tests
  → finishing-a-development-branch
```

##### Chain: Multi-Intent Prompt

```
brainstorming                       (decompose into intents, prioritize)
  → conductor (multi-track init)    (one track per intent)
    → for each track in dependency order:
        → use the appropriate single-intent chain above
        → /verify gate before next track starts
  → finishing-a-development-branch  (one PR or split per track, user's call)
```

##### Chain: Refactor (no behavior change)

```
[code-review of current state]      (understand existing intent)
  → writing-plans                   (refactor steps, each behavior-preserving)
  → test-driven-development         (characterization tests if absent)
  → ai-slop-cleaner                 (only if cleaning AI-generated bloat)
  → verification-before-completion  (behavior unchanged: tests still pass)
  → finishing-a-development-branch
```

**When to deviate from these chains:**
- User explicitly says "skip TDD" → drop test-driven-development
- Project's `CLAUDE.md` mandates a different workflow → follow it (CLAUDE.md > skill chains, per superpowers `using-superpowers` priority rule)
- Time-boxed prototype / spike → can drop verification-before-completion + requesting-code-review (mark explicitly: "this is a spike, not production")

### Phase 4: Missing Context Detection

Scan the prompt for missing critical information. Check each item and mark
whether Phase 0 auto-detected it or the user must supply it:

- [ ] **Tech stack** — Detected in Phase 0, or must user specify?
- [ ] **Target scope** — Files, directories, or modules mentioned?
- [ ] **Acceptance criteria** — How to know the task is done?
- [ ] **Error handling** — Edge cases and failure modes addressed?
- [ ] **Security requirements** — Auth, input validation, secrets?
- [ ] **Testing expectations** — Unit, integration, E2E?
- [ ] **Performance constraints** — Load, latency, resource limits?
- [ ] **UI/UX requirements** — Design specs, responsive, a11y? (if frontend)
- [ ] **Database changes** — Schema, migrations, indexes? (if data layer)
- [ ] **Existing patterns** — Reference files or conventions to follow?
- [ ] **Scope boundaries** — What NOT to do?

**If 3+ critical items are missing**, ask the user up to 3 clarification
questions before generating the optimized prompt. Then incorporate the
answers into the optimized prompt.

### Phase 5: Workflow & Model Recommendation

Determine where this prompt sits in the development lifecycle:

```
Research → Plan → Implement (TDD) → Review → Verify → Commit
```

For MEDIUM+ tasks, always start with /plan. For EPIC tasks, use blueprint skill.

**Model recommendation** (include in output):

| Scope | Recommended Model | Rationale |
|-------|------------------|-----------|
| TRIVIAL-LOW | Sonnet 4.6 | Fast, cost-efficient for simple tasks |
| MEDIUM | Sonnet 4.6 | Best coding model for standard work |
| HIGH | Sonnet 4.6 (main) + Opus 4.6 (planning) | Opus for architecture, Sonnet for implementation |
| EPIC | Opus 4.6 (blueprint) + Sonnet 4.6 (execution) | Deep reasoning for multi-session planning |

**Multi-prompt splitting** (for HIGH/EPIC scope):

For tasks that exceed a single session, split into sequential prompts:
- Prompt 1: Research + Plan (use search-first skill, then /plan)
- Prompt 2-N: Implement one phase per prompt (each ends with /verify)
- Final Prompt: Integration test + /code-review across all phases
- Use /save-session and /resume-session to preserve context between sessions
- For multi-session structured delivery, prefer the **conductor** skill (creates `.omc/conductor/` tracks with Context → Spec → Plan → Implement artifacts that survive across sessions)

### Phase 6: Compact Mode (output short-circuit)

When ALL of these are true, skip Section 1 (Diagnosis) and Section 5 (Rationale)
in the output — just deliver Section 2 (Components) + Section 3 (Full prompt) +
Section 4 (Quick) + Footer:

- Original prompt is < 300 characters AND
- Single, well-defined issue (no multi-part request) AND
- Tech stack auto-detected in Phase 0 AND
- Bug Triage scored ≥ 5/7 OR intent ≠ Bug Fix

**Why:** Real telemetry shows the majority of `/prompt-optimize` invocations
are short Chinese bug reports. Forcing them through full diagnosis adds reading
overhead with no signal. Diagnosis tables matter when prompts are ambiguous —
not when they're already concrete.

If Compact Mode triggers, prefix Section 2 with: `> Compact mode (short single-issue prompt). Full diagnosis skipped — ask if you want it.`

---

## Output Format

Present your analysis in this exact structure. Respond in the same language
as the user's input.

### Section 1: Prompt Diagnosis

**Strengths:** List what the original prompt does well.

**Issues:**

| Issue | Impact | Suggested Fix |
|-------|--------|---------------|
| (problem) | (consequence) | (how to fix) |

**Needs Clarification:** Numbered list of questions the user should answer.
If Phase 0 auto-detected the answer, state it instead of asking.

### Section 2: Recommended ECC Components

| Type | Component | Purpose |
|------|-----------|---------|
| Command | /plan | Plan architecture before coding |
| Skill | tdd-workflow | TDD methodology guidance |
| Agent | code-reviewer | Post-implementation review |
| Model | Sonnet 4.6 | Recommended for this scope |

### Section 3: Optimized Prompt — Full Version

Present the complete optimized prompt inside a single fenced code block.
The prompt must be self-contained and ready to copy-paste. Include:
- Clear task description with context
- Tech stack (detected or specified)
- /command invocations at the right workflow stages
- Acceptance criteria
- Verification steps
- Scope boundaries (what NOT to do)

For items that reference blueprint, write: "Use the blueprint skill to..."
(not `/blueprint`, since blueprint is a skill, not a command).

### Section 4: Optimized Prompt — Quick Version

A compact version for experienced ECC users. Vary by intent type:

| Intent | Quick Pattern |
|--------|--------------|
| New Feature | `/plan [feature]. /tdd to implement. /code-review. /verify.` |
| Bug Fix | `Use systematic-debugging for [bug] — list 3 hypotheses, verify each. Then /tdd: write failing test, fix to green. /verify.` |
| Bug Fix (intermittent) | `Use trace skill for [intermittent bug] — competing hypotheses with evidence. Build flaky-repro harness in /e2e. Fix only after 100% repro. /verify.` |
| Bug Fix (cross-platform) | `Use systematic-debugging for [bug]. Repro on both [platform A] and [platform B]. Fix. /verify on both platforms.` |
| Performance | `Use analyze for [slow path] — measure baseline first (timing/profile). Identify top 3 hotspots. Fix one at a time, re-measure after each. /verify regression.` |
| Refactor | `/refactor-clean [scope]. /code-review. /verify.` |
| Research | `Use external-context skill for [topic]. /plan based on findings.` |
| Research-then-Build | `Use external-context to study [reference X]. Produce comparison report. Then use conductor skill to track delivery: spec → plan → /tdd per phase.` |
| Testing | `/tdd [module]. /e2e for critical flows. /test-coverage.` |
| Review | `/code-review. Then use security-reviewer agent.` |
| Docs | `/update-docs. /update-codemaps.` |
| EPIC | `Use conductor skill (or blueprint) for "[objective]". Execute phases with /verify gates.` |

### Section 5: Enhancement Rationale

| Enhancement | Reason |
|-------------|--------|
| (what was added) | (why it matters) |

### Footer

> Not what you need? Tell me what to adjust, or make a normal task request
> if you want execution instead of prompt optimization.
>
> **For bug reports:** before pasting the optimized prompt into a new session,
> attach any error logs, stack traces, or screenshots — they make the
> investigation 10× faster than text descriptions alone.

---

## Examples

### Trigger Examples

- "Optimize this prompt for ECC"
- "Rewrite this prompt so Claude Code uses the right commands"
- "帮我优化这个指令"
- "How should I prompt ECC for this task?"

### Example 1: Vague Chinese Prompt (Project Detected)

**User input:**
```
帮我写一个用户登录页面
```

**Phase 0 detects:** `package.json` with Next.js 15, TypeScript, Tailwind CSS

**Optimized Prompt (Full):**
```
使用项目现有技术栈（Next.js 15 + TypeScript + Tailwind CSS）实现用户登录页面。

技术要求：
- 沿用项目现有的组件结构和路由约定
- 表单验证使用项目中已有的验证方案（检查是否已用 Zod/Yup/其他）
- 认证方式：沿用项目现有认证方案（如无，默认 JWT）
- 包含：邮箱/密码登录表单、表单验证、错误提示、加载状态、响应式布局

工作流：
1. /plan 先规划组件结构和认证流程，参考现有页面的模式
2. /tdd 测试先行：编写登录表单的单元测试和认证流程的集成测试
3. 实现登录页面和认证逻辑
4. /code-review 审查实现
5. /verify 验证所有测试通过且页面正常渲染

安全要求：
- 密码不明文传输
- 防止暴力破解（rate limiting）
- XSS 防护
- CSRF token

验收标准：
- 所有测试通过，覆盖率 80%+
- 页面在移动端和桌面端正常渲染
- 登录成功跳转到 dashboard，失败显示错误信息

不要做：
- 不要实现注册页面
- 不要实现忘记密码功能
- 不要修改现有的路由结构
```

### Example 2: Moderate English Prompt

**User input:**
```
Add a REST API endpoint for user profile updates with validation
```

**Phase 0 detects:** `go.mod` with Go 1.22, Chi router

**Optimized Prompt (Full):**
```
Add a REST API endpoint for user profile updates (PATCH /api/users/:id).

Tech stack: Go 1.22 + Chi router (detected from project)

Requirements:
- PATCH /api/users/:id — partial update of user profile
- Input validation for fields: name, email, avatar_url, bio
- Auth: require valid token, users can only update own profile
- Return 200 with updated user on success
- Return 400 with validation errors on invalid input
- Return 401/403 for auth failures
- Follow existing API patterns in the codebase

Workflow:
1. /plan the endpoint structure, middleware chain, and validation logic
2. /tdd — write table-driven tests for success, validation failure, auth failure, not-found
3. Implement following existing handler patterns
4. /go-review
5. /verify — run full test suite, confirm no regressions

Do not:
- Modify existing endpoints
- Change the database schema (use existing user table)
- Add new dependencies without checking existing ones first (use search-first skill)
```

### Example 3: Chinese Bug Report (real-data pattern)

**User input:**
```
当前分支的分享 html 项目或者 md 文档的功能，存在一个问题，就是如果用户修改已经分享的文件，无法再次分享，这样链接始终不会发生改变
```

**Phase 0 detects:** Tauri (Rust + Web) project. Git context: 3 uncommitted files in `src/share/`, branch `feat/share-html`.

**Phase 1.5 Triage:** repro 1/7 (only symptom), expected/actual implicit, environment unspecified, reproducibility 100% inferred. **Score 3/7 → fill TODO markers, do not block.**

**Optimized Prompt (Full):**
```
## 问题描述
分享 HTML 项目 / MD 文档功能：用户修改已分享文件后，无法再次生成新链接，
链接始终不更新。

## 复现步骤
1. 在当前分支（feat/share-html）打开任意 HTML 项目或 MD 文档
2. 点击分享，记录生成的链接 A
3. 修改文件内容并保存
4. 再次点击分享
5. 观察生成的链接是否变化

## 期望 vs 实际
- 期望：再次分享时生成新链接（或同链接但内容已更新）
- 实际：分享按钮无响应 / 链接不变 / 旧内容（请确认是哪种）

## 环境
- OS / 版本：[macOS / Windows，请补充]
- 复现率：100%（推测，请确认）
- 当前分支：feat/share-html
- 相关文件：src/share/*（git status 显示 3 个未提交改动 — 是否相关？）

## 工作流
1. **不要直接改代码**。先用 systematic-debugging skill 定位根因，候选假设：
   - H1: 分享缓存（按文件路径 key）未失效
   - H2: 文件 hash 计算逻辑用了 mtime 而非内容 hash
   - H3: 分享接口幂等性设计阻止了重复请求
   - H4: 前端短路 — 检测到"已分享"就不再触发请求
   对每个假设：阅读 src/share/ 相关代码 + 添加临时日志验证
2. /tdd 写 e2e 测试用例：分享 → 修改 → 再分享，断言链接或内容变化
3. 修复到 green
4. /verify：跑 e2e 测试 + macOS + Windows 各手测一次（Tauri 项目跨平台）
5. /code-review

## 不要做
- 不要改其他分享类型（仅 HTML / MD 文档）
- 不要重构 share 模块的整体架构
- 不要在没定位根因前做"清缓存"之类的猜测性修复
```

**Optimized Prompt (Quick):**
```
Use systematic-debugging for "分享 HTML/MD 后修改文件链接不更新" — list 3 hypotheses
(cache key, hash strategy, idempotent API), verify each. /tdd write failing e2e.
Fix to green. /verify on macOS + Windows.
```

### Example 4: EPIC Project

**User input:**
```
Migrate our monolith to microservices
```

**Optimized Prompt (Full):**
```
Use the blueprint skill to plan: "Migrate monolith to microservices architecture"

Before executing, answer these questions in the blueprint:
1. Which domain boundaries exist in the current monolith?
2. Which service should be extracted first (lowest coupling)?
3. Communication pattern: REST APIs, gRPC, or event-driven (Kafka/RabbitMQ)?
4. Database strategy: shared DB initially or database-per-service from start?
5. Deployment target: Kubernetes, Docker Compose, or serverless?

The blueprint should produce phases like:
- Phase 1: Identify service boundaries and create domain map
- Phase 2: Set up infrastructure (API gateway, service mesh, CI/CD per service)
- Phase 3: Extract first service (strangler fig pattern)
- Phase 4: Verify with integration tests, then extract next service
- Phase N: Decommission monolith

Each phase = 1 PR, with /verify gates between phases.
Use /save-session between phases. Use /resume-session to continue.
Use git worktrees for parallel service extraction when dependencies allow.

Recommended: Opus 4.6 for blueprint planning, Sonnet 4.6 for phase execution.
```

---

## Related Components

| Component | When to Reference |
|-----------|------------------|
| `configure-ecc` | User hasn't set up ECC yet |
| `skill-stocktake` | Audit which components are installed (use instead of hardcoded catalog) |
| `search-first` | Research phase in optimized prompts |
| `external-context` | Research external docs/products (e.g., "调研 Gemini CLI 怎么做的") |
| `systematic-debugging` | **Always** referenced for Bug Fix intent — root-cause before code |
| `trace` | Bug Fix with competing hypotheses, intermittent / 偶现 bugs |
| `analyze` | Performance intent or unknown-cause investigation |
| `debug` | OMC session/repo state diagnosis |
| `conductor` | Multi-session structured delivery (replaces blueprint for most cases) |
| `blueprint` | EPIC-scope when conductor is unavailable (legacy) |
| `electron-driver` | Electron cross-platform bugs requiring E2E repro |
| `strategic-compact` | Long session context management |
| `cost-aware-llm-pipeline` | Token optimization recommendations |
