---
name: quick-init-project
description: Use when the user wants to "quick init project", "bootstrap a new project", "recommend fullstack vs frontend vs backend", "initialize monorepo", "generate project scaffold", "project setup recommendation", or asks "快速初始化项目", "初始化 monorepo", "生成项目脚手架方案"
version: 1.0.0
argument-hint: <product requirement or idea>
---

<Purpose>
Quickly bootstrap a new project with intelligent mode selection (fullstack/frontend/backend/demo), data-dense tech stack recommendations based on 2026 ecosystem data, and executable initialization commands. Delivers a complete startup plan in 5-10 minutes with minimal input.
</Purpose>

<Use_When>
- User wants to start a new project from scratch
- User needs help deciding between fullstack, frontend-only, or backend-only architecture
- User asks for monorepo setup or project scaffolding
- User wants tech stack recommendations based on current ecosystem data
- User says "quick init", "bootstrap project", "initialize monorepo", "快速初始化项目", "根据需求推荐全栈还是前端/后端"
- User wants a project scaffold with best practices and modern tooling
</Use_When>

<Do_Not_Use_When>
- User wants to modify an existing project structure
- User has already decided on tech stack and just needs implementation help
- User wants to explore multiple architectural options without commitment (use `plan` skill instead)
- User wants to add features to an existing project (use `executor` agent)
- User is asking about general architecture concepts without a specific project
</Do_Not_Use_When>

<Why_This_Exists>
Starting a new project involves critical early decisions: architecture mode, tech stack, repository structure, and tooling. Making wrong choices early can compound into significant technical debt. This skill uses data-driven decision making (Stack Overflow surveys, npm download stats, State of JS/CSS 2024) to recommend proven, well-supported stacks and provides executable commands to get started immediately.
</Why_This_Exists>

## Research Baseline (as of 2026-02-26)

Decision making is based on the following public signals:
- Stack Overflow Developer Survey 2024: Node.js 40.8%, React 39.5%, Next.js 17.9%, NestJS 5.8%
- State of JS 2024: 67% respondents write more TypeScript than JavaScript
- State of CSS 2024: Tailwind CSS usage significantly leads CSS framework category
- npm weekly downloads (2026-02-18 to 2026-02-24):
  - `typescript`: 131,004,723
  - `react`: 96,415,450
  - `tailwindcss`: 60,494,373
  - `next`: 36,026,759
  - `@nestjs/core`: 7,290,173

## Input Contract

Extract at least the following inputs; use defaults when missing and note assumptions:
- Product goal: target users and core scenarios
- Delivery speed: `urgent (<1 week)` / `normal (2-4 weeks)` / `long (>4 weeks)`
- Team shape: frontend-heavy / backend-heavy / fullstack
- Runtime: web / api / both
- Data complexity: low / medium / high

Default assumptions: `normal + small team + web-first + medium complexity`

## Mode Selection

### Step 1: Hard Gates

Check in order; if hit, select mode immediately:
1. Only concept demo, idea validation, no production requirement -> `demo`
2. Backend exists with stable API contract, only need UI -> `frontend-only`
3. Frontend consumer exists, only need API/service -> `backend-only`
4. Frontend and backend both needed with frequent interface changes -> proceed to scoring (usually `full-stack`)

### Step 2: Weighted Scoring (0-100)

Dimension scoring range `1-5`:
- Requirement complexity (weight 25)
- Delivery speed pressure (weight 20)
- Team skill fitness (weight 20)
- Deployment constraint strength (weight 15)
- Data/state complexity (weight 20)

Mode target profiles:
- `full-stack`: [4, 3, 4, 3, 4]
- `frontend-only`: [2, 4, 4, 3, 2]
- `backend-only`: [3, 3, 4, 4, 4]
- `demo`: [1, 5, 3, 1, 1]

Calculation:
- `fit = 5 - abs(actual - target)`
- `modeScore = Σ(fit/5 * weight)`

Decision rules:
1. Top score < 60 -> fallback to `demo` + output information gaps
2. Top1 - Top2 >= 8 -> select Top1 directly
3. Gap < 8 -> compare `delivery speed`, `team skill fitness`, `change surface` in order

## Tech Stack Policy (Data-Dense First)

### Preferred Default Stack

- Language: `TypeScript`
- Frontend: `React + Next.js (App Router) + Tailwind CSS`
- Backend: `NestJS (REST-first) + OpenAPI`
- Package manager: `pnpm`
- Repository: `Monorepo` (pnpm workspaces)
- Task orchestration: `Turborepo` (default), upgrade to `Nx` when governance is required
- Quality baseline: `ESLint + Prettier + Vitest + Playwright`

### Escalation to Nx

Upgrade from Turborepo to Nx when:
- Project count >= 6 packages/apps
- Need enforced module boundaries (lint-level boundaries)
- Need mature affected execution and stronger governance

### Downgrade Rules

- Ultra-short PoC with only runnable pages -> can downgrade to single-repo single-app (non-monorepo)
- Backend single service with no shared packages -> can skip monorepo for now

## Architecture Templates

### 1) full-stack

```text
repo/
  apps/
    web/           # Next.js
    api/           # NestJS
  packages/
    ui/            # React shared components
    config/        # eslint/tsconfig/prettier shared config
    types/         # shared DTO/types
    sdk/           # typed API client
  turbo.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

Layering rules:
- `apps/*` can depend on `packages/*`
- `packages/ui` cannot depend on `apps/*`
- `packages/types` must stay framework-agnostic

### 2) frontend-only

```text
repo/
  apps/web/
  packages/
    ui/
    config/
    types/
```

Default: use `MSW` or mock server to decouple backend availability.

### 3) backend-only

```text
repo/
  apps/api/
  packages/
    config/
    types/
    contracts/     # OpenAPI schema + generated clients
```

Default: deliver `OpenAPI` first with health/readiness endpoints.

### 4) demo

```text
repo/
  apps/demo/
  packages/config/
```

Scope limit: single main flow + minimal dependencies + quick demo capability.

## Execution Workflow

<Agent_Orchestration>
Phase A (Requirement Parsing):
- Use Agent(subagent_type="oh-my-claudecode:analyst", model="sonnet")
- Extract: product goal, delivery speed, team shape, runtime, data complexity
- Output summary: problem statement, assumptions, unknowns (max 1 screen)
- Save to: `.omc/quick-init/requirements.md`

Phase B (Mode Decision):
- Use Agent(subagent_type="oh-my-claudecode:architect", model="opus")
- Apply hard gates first, then weighted scoring if needed
- Output: selected mode, scores, hard gate hit (if any), reasoning (max 3 bullets), risk note (1 line)
- Save to: `.omc/quick-init/decision.md`

Phase C (Bootstrap Plan):
- Use Agent(subagent_type="oh-my-claudecode:planner", model="sonnet")
- Generate: directory structure, init commands, milestones (Day 1/3/7), minimal verification commands
- Save to: `.omc/quick-init/bootstrap-plan.md`

Phase D (Command Generation):
- Direct execution: generate executable commands based on selected mode
- Save to: `.omc/quick-init/init-commands.sh`
</Agent_Orchestration>

### Default Command Templates

Full-stack or multi-package:
```bash
pnpm dlx create-turbo@latest
pnpm install
pnpm -r lint
pnpm -r test
pnpm -r build
```

Frontend-only (non-monorepo):
```bash
pnpm create next-app@latest web --ts --tailwind --eslint --app
cd web && pnpm test
```

Backend-only (non-monorepo):
```bash
pnpm add -g @nestjs/cli
nest new api
cd api && pnpm test
```

## Output Format

Every execution must return:

```text
## Init Recommendation
- Selected Mode: <full-stack|frontend-only|backend-only|demo>
- Confidence: <HIGH|MEDIUM|LOW>

## Decision Evidence
- Hard Gate: <rule-id or none>
- Scores: full-stack=<n>, frontend-only=<n>, backend-only=<n>, demo=<n>
- Why: <3 bullets max>

## Recommended Stack
- Runtime: ...
- Frameworks: ...
- Repo Strategy: ...

## Bootstrap Commands
[exact commands here]

## Folder Blueprint
[tree here]

## 7-Day Plan
1. Day 1 ...
2. Day 3 ...
3. Day 7 ...

## Risks & Mitigations
- Risk: ...
- Mitigation: ...
```

## Quality Gates

Before claiming "ready to initialize", must satisfy:
1. Mode selection has traceable basis (hard gate or complete scoring)
2. Tech stack includes TypeScript, with explanation if not using default stack
3. Commands are directly executable, no placeholders
4. Directory structure matches selected mode
5. At least one risk with mitigation provided

<Tool_Usage>
- Use `Agent` tool with appropriate subagent types for each phase
- Use `Write` tool to save outputs to `.omc/quick-init/` directory
- Use `Bash` tool to execute verification commands (lint/test/build) if user requests immediate setup
- Use `state_write(mode="quick-init")` to track progress across phases
- Use `notepad_write_working` to log key decisions for session context
</Tool_Usage>

<Examples>
<Good>
User: "快速初始化一个电商项目，需要前后端"
Why good: Clear domain (e-commerce), explicit requirement (fullstack). Skill will analyze and recommend appropriate stack with monorepo structure.
</Good>

<Good>
User: "bootstrap a SaaS dashboard with user auth and billing"
Why good: Specific features mentioned, clear product type. Skill can make informed mode and stack decisions based on complexity.
</Good>

<Good>
User: "quick init a REST API for inventory management"
Why good: Clear backend-only scenario. Skill will detect this via hard gate and recommend NestJS + OpenAPI setup.
</Good>

<Bad>
User: "add a new feature to my existing Next.js app"
Why bad: This is about modifying existing code, not initializing a new project. Use executor agent instead.
</Bad>

<Bad>
User: "what's the best way to structure a monorepo?"
Why bad: This is a general architecture question without a specific project. Respond conversationally or use plan skill.
</Bad>
</Examples>

<Execution_Policy>
- Each phase must complete before the next begins
- Analyst extracts requirements first, architect makes mode decision, planner generates bootstrap plan
- If requirements are too vague and analyst cannot extract sufficient information, pause and ask user for clarification
- If mode decision confidence is LOW, present options to user before proceeding
- All outputs must be saved to `.omc/quick-init/` for traceability
- Commands must be tested for syntax validity before presenting to user
</Execution_Policy>

<Escalation_And_Stop_Conditions>
- Stop and ask for clarification when requirements are too vague (confidence < 50%)
- Stop and present options when mode decision is ambiguous (top two scores within 5 points)
- Stop when user says "stop", "cancel", or "wait"
- If tech stack constraints conflict with best practices, explain tradeoffs and ask for confirmation
</Escalation_And_Stop_Conditions>

## Sources

- Stack Overflow Developer Survey 2024 (Technology): https://survey.stackoverflow.co/2024/technology
- State of JS 2024 (Usage): https://2024.stateofjs.com/en-US/usage/
- State of CSS 2024 (Tools): https://2024.stateofcss.com/en-US/tools/
- npm downloads API:
  - https://api.npmjs.org/downloads/point/last-week/typescript
  - https://api.npmjs.org/downloads/point/last-week/react
  - https://api.npmjs.org/downloads/point/last-week/tailwindcss
  - https://api.npmjs.org/downloads/point/last-week/next
  - https://api.npmjs.org/downloads/point/last-week/@nestjs/core
- Turborepo docs: https://turborepo.com/docs
- pnpm workspaces: https://pnpm.io/workspaces
- Nx monorepo docs: https://nx.dev/docs/features/maintain-typescript-monorepos
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references
