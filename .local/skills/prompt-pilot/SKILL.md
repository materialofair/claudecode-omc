---
name: prompt-pilot
description: >-
  Optimize a rough prompt with an independent subagent, present several
  CONCISE ready-to-run variants for the user to pick or edit, then EXECUTE
  the chosen prompt directly in the current session. Unlike prompt-optimizer
  (advisory only — it just hands back text), prompt-pilot closes the loop:
  optimize → choose → run.
  TRIGGER when the user wants both optimization AND execution: "优化并执行",
  "优化提示词后直接做", "优化指令然后执行", "帮我把这个需求优化好再做",
  "optimize and run my prompt", "improve this prompt then do it",
  "refine my prompt and execute it", or when the user explicitly invokes
  /prompt-pilot.
  DO NOT TRIGGER when the user only wants advice/text back with no execution
  ("优化prompt", "改进prompt", "rewrite this prompt", "how to write a prompt
  for") — that is prompt-optimizer. DO NOT TRIGGER for "优化代码" / "优化性能"
  / "optimize this code" / "optimize performance" — those are refactoring or
  performance tasks. DO NOT TRIGGER when the user says "直接做" / "just do it"
  with no request to optimize — execute the task normally without this skill.
origin: fork
metadata:
  author: oh-my-claudecode
  version: "1.2.0"
  changelog: |
    1.2.0 — Swept Medium/Low review items: terminal behavior for a repeated
            clarifying-questions loop (no infinite re-dispatch); tightened the
            over-broad "When to Use" line so a bare vague task can't trigger it;
            read-only subagent is now tool-enforced (prefer analyst/Explore, not
            general-purpose) and glm-5.2 for cost; variants must match the
            raw prompt's language; "Other" disambiguates custom-prompt vs
            reject/re-optimize; added explicit non-trigger examples.
    1.1.0 — Hardened the optimize→execute loop after an adversarial review:
            (1) forward pasted conversation context/attachments into the
            optimizer subagent (it cannot see the thread); (2) defensive JSON
            parsing — strip fences, retry once, fall back to raw text / original
            prompt instead of fabricating variants; (3) grounding discipline so
            the subagent never bakes unverified paths into an auto-executed
            variant; (4) explicit, mandatory execution gate with a
            destructive-operation hard stop.
    1.0.0 — Initial release.
argument-hint: <your rough prompt / task idea>
user-invocable: true
disable-model-invocation: false
model: glm-5.2
---

# Prompt Pilot

Take a user's rough prompt, hand the *optimization work* to an independent
subagent, get back **3 concise, ready-to-run prompt variants**, let the user
pick / edit / supplement one, then **run the chosen prompt in this session**.

This is the execution sibling of `prompt-optimizer`. Where prompt-optimizer
stops at "here is a better prompt", prompt-pilot continues all the way to
"...and here is the result of running it".

## When to Use

- User wants the prompt improved **and then executed**: "优化并执行：…",
  "帮我把这个需求优化好再做", "optimize and run my prompt"
- User pastes a vague task **and explicitly asks to sharpen it before doing it**
  — there must be an optimize-and-run signal, not merely a vague request. A bare
  vague task with no such signal is a normal task, not this skill.
- User explicitly invokes `/prompt-pilot`

### Do Not Use When

- User only wants the optimized text handed back → use `prompt-optimizer`
- User says "直接做" / "just do it" with no optimize request → execute normally
- "优化代码" / "优化性能" / "optimize this code/performance" → refactor/perf task

## Workflow

Run these four steps in order. Do NOT do the optimization yourself in the main
context — that is the subagent's job (keeps the main context clean and gives an
independent pass).

### Step 1 — Capture the raw prompt

Take everything after the trigger as the raw prompt. If the user only typed the
trigger with no task, ask once: "What do you want to get done?" Then proceed.

### Step 2 — Dispatch ONE independent optimizer subagent

Dispatch a **read-only** subagent with the instruction block below — prefer one
with no Write/Edit access (`analyst`, or `Explore`/`explore`) so the read-only
rule is tool-enforced, not just prompt-level. Avoid `general-purpose` here: it
can mutate files. GLM-5.2 is plenty for this optimization pass —
and for the actual execution in Step 4. The subagent runs a compressed
version of the prompt-optimizer methodology (intent + gap analysis, light
project probe, ECC component match) but its deliverable is **3 concise
variants**, NOT a giant essay.

Send the subagent exactly this (fill in `<RAW_PROMPT>`, `<CWD>`, and
`<CONTEXT>`). **Critical — the subagent cannot see this conversation; it only
gets what you paste.** Before dispatching, gather anything in the thread that
bears on the task — pasted error logs, stack traces, file snippets, the
described content of screenshots, and any clarifications the user already gave —
and put it in `<CONTEXT>`. If there is genuinely none, set `<CONTEXT>` to
`none`. Skipping this is the skill's biggest quality leak: bug reports usually
carry their diagnosis in the pasted payload.

> You are a prompt optimizer. Analyze the user's raw prompt and return
> optimized, **ready-to-run** prompts. You are READ-ONLY: do not write files,
> run mutating commands, or execute the task — only analyze and return text.
>
> Raw prompt: `<RAW_PROMPT>`
> Working directory: `<CWD>`
> Conversation context — logs / snippets / clarifications the user already gave;
> treat as authoritative input, not as something to re-ask: `<CONTEXT>`
>
> Do this:
> 1. Identify the real intent and the task type (feature / bugfix / refactor /
>    research / perf / docs / other).
> 2. Light project probe (≤ 5 read-only calls): detect stack from manifests,
>    skim CLAUDE.md/AGENTS.md/README if present, `git status --short` only if
>    the prompt references current changes/branch. Cite only what you actually
>    read. Skip silently if nothing is found.
> 3. Produce **exactly 3 concise variants** that differ by SCOPE/ambition:
>    - **A) Minimal** — smallest correct change that satisfies the core ask.
>    - **B) Balanced** — standard quality bar, the sensible default.
>    - **C) Thorough** — includes tests / verification / edge cases.
>    Each variant's `prompt` field is a tight, self-contained instruction
>    (target ≤ 6 lines) that could be pasted and run as-is, written in the SAME
>    language as the user's raw prompt. State assumptions inline rather than
>    asking, unless a CRITICAL fact is missing.
>    **Grounding discipline — the chosen variant gets AUTO-EXECUTED, so a wrong
>    path becomes a wrong mutation:** only cite a file path, symbol, or version
>    you actually opened during the probe. Anything inferred from a commit
>    subject, branch name, README claim, or guess must be written as
>    "verify <X> before editing", never stated as established fact. Do not
>    invent paths to make a variant look concrete — a vaguer-but-true
>    instruction beats a precise-but-hallucinated one.
> 4. If a critical fact is missing such that all 3 variants would be guesses,
>    return up to 3 clarifying questions in `clarifying_questions` and leave
>    `variants` empty.
>
> Return ONLY valid JSON, no prose around it:
> ```json
> {
>   "intent": "one-line restatement of what the user wants",
>   "task_type": "feature|bugfix|refactor|research|perf|docs|other",
>   "assumptions": ["..."],
>   "variants": [
>     {"id": "A", "label": "Minimal",  "prompt": "...", "note": "scope in <12 words"},
>     {"id": "B", "label": "Balanced", "prompt": "...", "note": "..."},
>     {"id": "C", "label": "Thorough", "prompt": "...", "note": "..."}
>   ],
>   "clarifying_questions": []
> }
> ```

**Parse the result defensively — do not assume clean JSON.** Subagents often
wrap JSON in ```` ``` ```` fences or add prose. Before trusting it:

- Strip any markdown fences / surrounding prose, then parse the JSON.
- If parsing fails, the JSON is empty, or `variants` is missing or not exactly
  3 entries → re-dispatch Step 2 **once** with an appended line: "Your previous
  reply did not parse as the required JSON object — return ONLY that object,
  no fences, no prose."
- If the retry still fails → do NOT fabricate variants. Show the user the
  subagent's raw text, ask them to pick or paste a prompt manually, then go to
  Step 4.
- If a subagent dispatch errors out / returns nothing → tell the user the
  optimizer failed and offer to run their original raw prompt as-is (with the
  same Step 3 confirmation) instead of silently dropping the request.
- If BOTH `variants` and `clarifying_questions` come back non-empty → use the
  variants and ignore the questions.

If the subagent returns `clarifying_questions` (empty `variants`), ask the user
those questions, fold the answers into the raw prompt, and re-dispatch Step 2 once.
If that second dispatch *still* returns only `clarifying_questions`, do not loop
again — ask any remaining questions inline, take the user's answers as the spec,
generate the 3 variants yourself in the main session, and proceed to Step 3.

### Step 3 — Present the variants and let the user choose / edit / supplement

Use `AskUserQuestion` with the three variants as options. Put the variant's
`prompt` text in each option's `preview` so the user can read the actual prompt
they'd run. Header: "Which prompt". The built-in "Other" choice lets the user
type a fully custom prompt; the per-option notes field lets them **supplement
details** onto a chosen variant.

- If the user picks a variant cleanly → that variant's prompt is the final prompt.
- If the user adds notes/supplements → merge their additions into the chosen
  variant's prompt.
- If the user picks "Other" → disambiguate its two uses: if the text is a usable
  prompt, use it as the final prompt; if it's a rejection ("none of these",
  "重新优化", "都不行"), treat it as re-optimize — go back to Step 2 with their
  feedback, do NOT execute.

Then echo the **final prompt** back in one short block and get an **explicit
go** before running — a clear affirmative such as "yes" / "run it" / "go". The
variant pick alone is NOT the go-ahead, and silence is never consent: wait for
the affirmative.

**Destructive-operation hard stop.** If the final prompt implies an
irreversible or high-blast-radius action — deletes, `rm`, dropping data,
`git push --force`, mass rewrites across many files, schema/data migrations —
do not fold it into the normal confirm. Call it out explicitly, restate exactly
what will be affected, and require a second confirmation that names the
operation before anything runs.

### Step 4 — Execute in the current session

Only after the explicit go from Step 3, run the final prompt as a normal task
**in this session** (not via the optimizer subagent). Apply OMC routing as
usual: delegate the actual implementation to the
appropriate agent/skill the final prompt implies (executor, debugger,
test-driven-development, etc.), verify, and report results.

The optimizer subagent never executes — it only produced the candidates. All
execution happens here, in the main context, under the user's chosen prompt.

## Guardrails

- One optimizer subagent per request (plus at most one re-dispatch after
  clarifying questions). Don't spin up a fleet just to write prompts.
- Variants must be CONCISE and runnable — if a "variant" reads like an essay,
  it failed; tighten it.
- Never silently execute a variant the user didn't choose. Choice gates execution.
- If the user, after seeing variants, says "none of these / 重新优化", re-dispatch
  Step 2 with their feedback instead of forcing a choice.
- This skill spans optimize→run. If the user only wanted the text, point them to
  `prompt-optimizer` and stop.

## Example

```
User: 优化并执行：给登录接口加个限流

Step 2 → analyst subagent returns:
  intent: "Add rate limiting to the login endpoint"
  task_type: feature
  variants:
    A) Minimal  — "Add a fixed-window rate limiter (5/min/IP) to POST /login in
                   src/routes/auth.ts, return 429 on exceed. No new deps."
    B) Balanced — "Add IP+account rate limiting to /login with a small reusable
                   middleware, configurable limit via env, 429 + Retry-After."
    C) Thorough — Balanced + unit tests for limiter, an integration test on the
                   route, and a verify pass.

Step 3 → AskUserQuestion (A/B/C, previews show full prompt text).
  User picks B, adds note: "limit should be 10/min".

Step 3 (cont.) → echo final prompt (Balanced, 10/min), wait for explicit "go".
Step 4 → on confirmation, run it in this session, delegating to executor,
          then verify.
```

### Non-triggers (route elsewhere)

```
"优化prompt：写个爬虫"          → prompt-optimizer (text only, no execution)
"rewrite this prompt clearer"   → prompt-optimizer
"优化性能" / "optimize this code" → refactor / perf task, not this skill
"直接做：删掉这个函数"           → normal execution (no optimize signal)
```
