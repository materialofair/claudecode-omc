---
name: merge-review
description: "MANUAL ONLY. Run a structured pre-MR review when the user explicitly requests merge-review via /merge-review, $merge-review, merge-review, or natural language such as 执行 merge-review. Produces impact analysis report, merge readiness checklist, regression self-check, code quality audit, and changelog for the current branch against origin/main."
---

# Merge Review

Run a one-stop pre-MR review for the current branch. Combine impact analysis, merge readiness check, regression self-verification, and code quality review into a single structured report plus a changelog draft.

## Trigger rule

This skill is **manual-only**.

Invoke it **only** when the user's message explicitly requests this workflow with one of these trigger forms:

- `/merge-review`
- `$merge-review`
- `merge-review`
- 明确自然语言请求，例如「执行 merge-review」「跑 merge-review」「给我去执行merge-review」

Do **not** run it for generic "review" requests, normal code-review requests, or questions that only mention the skill without asking to execute it.

## Operating model

Treat this skill as a **workflow skill**, but keep side effects controlled:

1. **Default mode: review-first**
   Read files, run checks, analyze diffs, and produce the report.

2. **Write mode: changelog draft**
   Always prepare a changelog draft for this review run, but write it to disk only when the review conclusion is `✅ Ready` or `⚠️ With fixes`.

3. **Git-changing actions: confirm first**
   Do not automatically merge, commit, or push unless the workflow explicitly requires user confirmation at that step.

Use this principle throughout the workflow:
- Prefer read-only analysis by default
- Ask before changing git history or remote state
- Keep the report useful even if some commands fail

## Review scope

Review only changes owned by the current branch:
- `git diff origin/main...HEAD` for committed branch-owned changes
- `git diff` and `git diff --cached` for unstaged/staged local changes

Do **not** treat code merged from `main` as branch-owned review scope.

## Evidence model

Phase 1 scripts and grep-based signals are **heuristics**, not truth.

Use them to find likely impact and likely consumers, but make final judgments by reading the actual code:
- Read the changed file
- Read the consumer call site when compatibility matters
- Run a test or command when uncertainty remains

Never treat script output alone as sufficient proof that a change is safe.

## Module → features doc mapping

Derive the features doc path by taking the last path segment without extension, preserving original casing:

`electron/main.js` → `docs/features/main.md`
`src/pages/ChatPage.jsx` → `docs/features/ChatPage.md`

## Phase overview

| Phase | 目标 | 产出 | 可能阻塞 |
|-------|------|------|----------|
| Pre-flight | 埋点评估补埋 + 提交未提交修改 | 干净工作树（含埋点改动） | 敏感文件 / 埋点基础设施缺失 |
| 0 | 准备 | 基线信息、变更文件清单 | merge 状态 |
| 1 | 影响分析 | 影响面清单、反向引用 | 脚本失败 |
| 1.5 | 分类 | 文件 review 分级 | 无 |
| 2 | 合并就绪 | 规范检查表 | lint 超时 |
| 3 | 回归自检 | 契约验证结果 | features doc 缺失 |
| 4 | 代码质量 | 分级 issue 清单 | 无 |
| 5 | 输出报告 | 结构化 review 报告 | 无 |
| 6 | Changelog | 变更日志文件 | 无 |
| 7 | 合并确认 | commit / push (+ 远程合入打包进同一确认) | 用户拒绝 |
| 8 | 远程合入 main | loomy 远程 dispatch（执行 Phase 7 已拿到的确认） | loomy 未安装 / Phase 7 拒绝 / 前置失败 |

## Workflow

### Pre-flight: 埋点评估 + 提交未提交修改

执行 `/merge-review`、`$merge-review`、`merge-review` 或同等明确自然语言触发，即视为用户已准备好把当前分支送审。本步骤先**自动评估并按需补埋点**，再把工作树打包提交——这样埋点产生的代码改动会和其余改动一起进入 Phase 0 review 范围（被 lint、质量审查、changelog、push 自然覆盖），无需额外提交逻辑。

#### A. 埋点评估（自动判断是否调用 tracking-assistant）

复用 `tracking-assistant` 技能的「识别口径」对**当前分支自有改动**做评估（review scope 与本技能一致：只看分支自有 diff，不含 main 后续提交）。

1. 用确定性解析跑一遍候选数（基础设施缺失或命令报错 → 记「埋点评估：跳过（埋点基础设施缺失）」并直接进入 B）：

   ```bash
   node --input-type=module -e "
   import { parseDiffCandidates } from './src/lib/ifly-tracking-doc.js'
   import { execSync } from 'child_process'
   const base = execSync('git merge-base origin/main HEAD', { encoding: 'utf8' }).trim()
   const diff = execSync('git diff ' + base, { encoding: 'utf8' })
   console.log('新增行候选数:', parseDiffCandidates(diff).length)
   "
   ```

   > 若需对齐远端，可先 `git fetch origin main --quiet`；此处为启发式评估，轻微滞后可接受。

2. 对新增行按 tracking-assistant 识别口径深度判断「是否存在应埋未埋的点」：
   - **应列为候选**：有业务语义的关键交互点击（入口按钮、面板/弹窗触发、页面跳转、功能切换/选择）、成功路径完成（API 成功回调、异步 resolve 后的明确完成点）。
   - **排除**：纯展示组件、内部工具函数、已有 `trackIFlyEvent` 的路径、`onChange/onFocus/onBlur` 等低语义事件、错误处理路径。

3. **不需要埋点**（无应埋未埋点）→ 在报告中记一行「埋点评估：无需补埋」，进入 B。

4. **需要埋点**（存在 ≥1 个应埋未埋点）→ **自动调用 `tracking-assistant` 技能**（announce：`Using tracking-assistant to 补埋点`），由它驱动 识别 → 确认 → 埋点 → 刷新文档 四步闭环。约束：
   - tracking-assistant 自身的硬门禁仍然生效——它的 Step 2 会把候选清单交用户逐条确认，未确认不写任何代码；merge-review **不绕过**这道确认。
   - 它完成后产生的改动（`src/lib/ifly-collector.js`、触发点文件、去重辅助文件、`docs/埋点事件清单.md`）留在工作树，交给下面 B 一并提交。
   - 在报告中记一行「埋点评估：已补埋 N 个事件（key + FT 号）」。

#### B. 提交未提交修改

如果工作树存在未提交修改（含上面 A 步骤补埋产生的改动），先把它们打包提交，再进入 Phase 0；如果工作树干净，跳过本步骤。

1. 检查工作树状态：

   ```bash
   git status --porcelain
   ```

2. 输出为空 → 跳过，进入 Phase 0。

3. 输出非空 → 按以下流程自动提交：

   - 用 `git diff` + `git diff --cached` + `git ls-files --others --exclude-standard` 收集本次将被纳入的全部改动
   - 基于改动内容生成 conventional 风格 commit message（`feat / fix / refactor / docs / chore / perf` 等），一句话覆盖核心改动，控制在 70 字以内；多个独立改动从中抽公因数，不要直接抄某一个文件名
   - 执行：

     ```bash
     git add -A
     git commit -m "<生成的 message>"
     ```

4. 敏感文件保护：如果待提交清单包含 `.env*`、`*credentials*`、`*.pem`、`*.key`、`id_rsa*` 等疑似敏感文件，停下来列出这些文件并询问用户是否仍要包含，不要默认提交。

5. 提交失败（例如 pre-commit hook 拒绝）→ 记录失败原因，中止本次 review 并报告给用户，不要 `--no-verify` 绕过。

6. 提交成功后，进入 Phase 0 基线收集；新生成的 commit 会被 Phase 0 的 `git log` / `git diff origin/main...HEAD` 自然纳入 review 范围。

### Phase 0: Prepare

Gather baseline information:

```bash
git rev-parse --abbrev-ref HEAD
git fetch origin main --quiet
git merge-base --is-ancestor origin/main HEAD && echo "MERGED" || echo "NOT_MERGED"
git log --oneline --first-parent origin/main..HEAD
git diff --name-only origin/main...HEAD
git diff --name-only
git diff --name-only --cached
git ls-files --others --exclude-standard
```

Record:
- `BRANCH_NAME`
- `MERGED_MAIN`
- `CHANGED_FILES` (committed + unstaged + staged + untracked, deduplicated)
- `COMMIT_COUNT`
- `BASE_SHA`
- `HEAD_SHA`

#### Large changeset guard

If `CHANGED_FILES` exceeds 60 个文件，自动启用**聚焦 review** 模式：仅对 deep-review 分级的文件做完整分析，其余文件仅列出变更概要。在报告中注明已自动切换模式。

If `NOT_MERGED`,自动执行 `git merge origin/main`。如果出现合并冲突，按以下策略处理：

1. 逐文件读取冲突标记，理解双方（当前分支 vs origin/main）各自的逻辑意图
2. 合并时保留双方的功能实现，确保功能完整性——不简单丢弃任一方的变更
3. 对于逻辑冲突（同一函数/模块双方都有实质性修改），分析上下文后融合两边逻辑，而非仅保留一方
4. 对于机械性冲突（import 顺序、相邻行新增等），合并后确保无重复、无遗漏
5. 每个冲突文件解决后运行 `git diff --check` 确认无残留冲突标记
6. 所有冲突解决后执行 `git merge --continue` 完成合并
7. 如果某个冲突确实无法安全自动解决（如双方对同一逻辑做了互斥的重构），记录该文件并在报告中标注，继续 review 其余内容

### Phase 1: Impact Analysis

Run the bundled script with all changed files:

```bash
.opencode/skills/merge-review/scripts/impact-report.sh <changed_files...>
```

Use the output to gather:
- recent history per file
- concurrent commits on `origin/main`
- exported symbols and likely reverse references for code files

If concurrent commits on `origin/main` are reported:
- read each commit with `git show <sha>`
- judge overlap with the current branch's changed areas
- flag meaningful overlap in the report

Locate `docs/features/<module>.md` for each touched module using the mapping rule.
If missing, note `缺失` in the report, but do not block the review.

### Phase 1.5: Triage

Classify each changed file into review 分级：

**Deep review**（逐行审查 + 消费方验证）：
- `electron/main.js`、`electron/preload.js`、`src/electron.d.ts`（IPC 三件套）
- 含 `export` 且被其他文件引用的代码文件
- diff 改动行数 ≥ 30 行的代码文件（用 `git diff --stat origin/main...HEAD` 判断）
- 涉及安全敏感操作的文件（`child_process`、`shell.openExternal`、`contextBridge`）

**Scan only**（浏览变更，仅在发现明显问题时深入）：
- diff 改动行数 < 30 行且无 export 变化的代码文件
- 配置文件（`vite.config.*`、`tailwind.config.*`、`package.json`）
- 测试文件（`*.test.js`、`*.test.jsx`）
- 文档和 changelog

**Skip detailed review**（仅记录变更，不做内容审查）：
- 生成文件：`themes.css`、`pnpm-lock.yaml`
- 纯资源文件：图片、字体

Use the tiers to prioritize effort, but do not hide meaningful issues in "scan only" files if they clearly affect behavior.

### Phase 2: Merge Readiness

Check:

| Check | Command / Method |
|---|---|
| Branch naming | Verify prefix is one of `feat/ fix/ docs/ style/ refactor/ perf/ test/ build/ ci/ chore/ revert/` |
| Merged origin/main | Result from Phase 0 |
| Commit messages | `git log --oneline --first-parent origin/main..HEAD` |
| Lint | `pnpm lint` |

Rules:
- Merge commits are allowed
- For non-merge commits, flag subjects shorter than 4 chars or blacklist matches: `fix bug`, `update`, `修改`, `test`, `temp`, `wip`, `fixup`, `squash`
- If lint fails, treat it as an **Important** merge-readiness issue by default; escalate to **Critical** if the failure blocks required workflow or clearly indicates broken functionality

#### Lint 自动修复

如果 lint 失败，自动执行 AI 辅助修复流程：

处理规则：
- 先跑 `pnpm lint --fix` 解决格式、排序等机械性问题
- 对剩余错误，逐个读取对应文件上下文，理解错误原因后修复代码
- 每次修复后重跑 `pnpm lint` 确认结果，最多迭代 3 轮
- 3 轮后仍有剩余错误，记录到报告中，不再尝试
- 所有修复产生的变更不自动 commit，留到 Phase 7 由用户统一决定

### Phase 3: Regression Self-Check

For each touched module, locate its features doc.

#### Path A: features doc exists

Read:
- `对外契约`
- `已知回归点`

For each relevant item, answer:
- Did the change break the contract?
- Did it cover the relevant edge case?
- Did it disturb a coupling point?

When unsure, read the actual consumer code or run a check. Never write "probably fine" without evidence.

#### Path B: features doc missing

Do not skip regression review. Use code-based checks instead:

1. Compare old/new export signatures:

```bash
.opencode/skills/merge-review/scripts/export-diff.sh <file>
```

2. For each changed exported symbol, perform the following checks:
   - **签名兼容性**：参数数量、参数顺序、默认值是否变化
   - **返回值变化**：返回类型或结构是否改变（如从返回对象变为返回数组）
   - **行为语义**：函数内部逻辑是否改变了调用方的预期行为（如错误处理方式、副作用）
   - **消费方验证**：读取 Phase 1 中识别的消费方调用代码，确认兼容

3. For CommonJS modules (`module.exports` / `exports.`), manually compare the old/new exported object structure since `export-diff.sh` only covers ES module syntax.

4. Record the module under `未覆盖`, and append a brief summary of findings from above checks.

### Phase 4: Code Quality Review

Read the branch-owned diff and evaluate against:

1. Generic criteria in `references/review-criteria.md`
2. Loomy high-risk checklist in `references/review-criteria.md`
3. Current `AGENTS.md` collaboration hard rules

Categorize issues as:
- **Critical（必须修）**
- **Important（应该修）**
- **Minor（建议改）**

Every issue must include:
- file reference
- what is wrong
- why it matters

### Phase 5: Output Report

Generate the report using `references/report-template.md`.

Keep the report concrete:
- findings first
- strengths only if real and specific
- no boilerplate

### Phase 6: Write Changelog

Always prepare a changelog draft for this review run.

#### 写 changelog 前的能力域归类

按用户/QA 视角对本次改动做能力域归类（不维护外部词表，全凭 Phase 1-4 证据自由推断）：

1. **脑暴**：基于 Phase 1 影响分析、diff 路径、commit message、features doc，列出本次涉及的所有用户视角能力维度（例：会话、权限、上下文整理、远程渠道-飞书|QQ|微信|钉钉、UI 展示、记忆与学习技能、平台兼容、MCP、技能系统、模型/Provider 等——按本次实际涉及推断，不套模板）
2. **反查**：每个改动文件至少落入一个能力维度，未落入的回到步骤 1 补维度；纯文档/配置/构建脚本类改动可整体标"无能力域影响"
3. **填充**：每个能力域下的"可能破坏的场景"必须基于 Phase 1 证据（export 变化、消费方调用、commit 描述），不允许凭空写"可能有问题"
4. **命名漂移**：单次 changelog 读者视角能读懂即可，不强求跨 changelog 一致

File path:

`docs/changelog/{YYYY-MM-DD}/{BRANCH_NAME}.md`

Where `{BRANCH_NAME}` replaces `/` with `-`.

Use `references/changelog-template.md`.

Write policy:
- If the conclusion in Phase 5 is `✅ Ready` or `⚠️ With fixes`, create or update the changelog file.
- If the conclusion in Phase 5 is `❌ Not ready`, do **not** write the changelog file. Instead, include a short `Changelog draft (not persisted)` section in the final report so the branch context is still captured without producing a misleading changelog artifact.

If a changelog already exists for the same date and branch, update it instead of creating a duplicate.

### Phase 7: Commit / Push / Remote Merge Gate

After writing the changelog，**先评估 Phase 8（远程合入 main）是否在本次 scope 内**，然后用一次性合并确认覆盖所有副作用步骤——不允许把"是否合入 main"拆成第二个确认点。

1. 评估 Phase 8 scope，两条都满足才算 in scope：
   - Phase 5 结论为 `✅ Ready` 或 `⚠️ With fixes`
   - `command -v loomy` 找得到 loomy CLI

2. 一次性向用户发起合并确认，措辞按 scope 切换：
   - **Phase 8 in scope**：「是否 **commit changelog + push 分支 + 通过 loomy 远程合入 main**？(yes/no)」
   - **Phase 8 不在 scope**：「是否 **commit changelog + push 分支**？(yes/no)」并附一句跳过 Phase 8 的原因

3. 用户明确 yes → 按顺序执行，任何一步失败立即停下、后续步骤不再触发：

```bash
git add docs/changelog/
git commit -m "docs: 添加 merge review changelog — {BRANCH_NAME}"
git push origin {BRANCH_NAME}
```

- commit 成功但 push 失败（网络中断、pre-push hook 拒绝）→ 报告错误请用户决策，不自动重试；同时**跳过 Phase 8**（远端没有最新代码，hermes 看不到）
- push 成功 → 立即按下面"MR 标题生成规则"算出 `MR_TITLE`（Phase 8 dispatch 需要复用，不能延后到最终块才算）；同时执行 `git config user.name` 拿到 `GIT_USERNAME`（用于拼接最终块）
- push 成功 + Phase 8 in scope → 拿着 `MR_TITLE` 进入 Phase 8 执行 dispatch，不再二次确认
- push 成功 + Phase 8 不在 scope → 结束 Phase 7，进入最终块输出

4. 用户 no → 不 commit、不 push、不 dispatch。给出可手动复用的命令块（commit + push + 如果 Phase 8 in scope 也给出 dispatch 命令，并把 `MR_TITLE` 拼进 dispatch 文本）；最终块仍输出 MR 标题与创建 URL，但注明"本次未推送，下游动作未触发"。

5. push 成功后（无论是否进入 Phase 8），总是输出如下两行作为最终块，用户可直接复用（`MR_TITLE` 与 `GIT_USERNAME` 复用步骤 3 已拿到的同一份值，不要再算一次）：

```
📝 建议 MR 标题: <type(scope): 一句话总结本分支的核心改动> — <GIT_USERNAME>
🔗 创建 MR: https://code.iflytek.com/osc/_source/CBG_CBD/editVerse/Loomy/-/pull_requests/new
```

MR 标题生成规则：
- 用 conventional 风格前缀（`feat / fix / refactor / docs / chore / perf` 等），与本分支主导改动类型对齐
- 一句话覆盖"做了什么 + 影响哪一块"，控制在 70 字以内（不含尾部署名段）
- 不要直接抄某一条 commit subject；要从全部 commits 里抽公因数。例如本分支同时新增 `/skill` 指令解析、收敛 agent 体系、对齐 memory 行为，就要在标题里体现"远程通道 /skill + agent 收敛"这类合并语义
- 末尾追加 ` — <GIT_USERNAME>` 署名段，`GIT_USERNAME` 取 `git config user.name`；若该命令为空或失败，省略署名段不要伪造

Never auto-push or auto-dispatch without an explicit confirmation in the current execution.

### Phase 8: Remote merge to main (loomy dispatch)

本阶段**只做执行**，确认已在 Phase 7 的合并 yes/no 里一并完成,不要再问第二次。

#### 进入条件

进入本阶段需同时满足：

- Phase 5 结论为 `✅ Ready` 或 `⚠️ With fixes`
- `command -v loomy` 找得到 loomy CLI
- Phase 7 push 已成功
- 用户在 Phase 7 的合并确认中选择了 yes

任一不满足 → 跳过 Phase 8，在最终块追加一行跳过原因，例如「跳过 Phase 8：未检测到 loomy CLI」「跳过 Phase 8：review 结论为 ❌ Not ready」「跳过 Phase 8：Phase 7 push 未成功」「跳过 Phase 8：用户在 Phase 7 拒绝合并动作」。

#### 流程

1. 执行 dispatch（无须再次确认）。复用 Phase 7 已生成的 `MR_TITLE`（含尾部 ` — <GIT_USERNAME>` 署名段），让 hermes 直接拿去当 MR 标题用：

   ```bash
   loomy chat --new "针对当前项目，请把分支 {BRANCH_NAME} 合入 main。MR 标题（请逐字使用，不要修改、不要追加任何署名）：<MR_TITLE>。review 结论：<Phase 5 结论>。changelog：docs/changelog/{YYYY-MM-DD}/{BRANCH_NAME}.md。"
   ```

   - `MR_TITLE` 必须复用 Phase 7 步骤 3 算出的值（含 ` — <GIT_USERNAME>` 署名段），**整体原样塞进 dispatch 文本**——不要再算一次、不要剥掉署名段、不要让远端再生成一个版本
   - 署名段记录的是本地人类作者（`git config user.name`），不是远端 worker 身份；dispatch 文本里那句"请逐字使用，不要修改、不要追加任何署名"就是为了防止 hermes 二次套用署名规则把自己的 worker 用户名拼上去
   - 用 `--new` 开新 session，避免历史 chat 上下文污染
   - 不要拼 `--project / --branch / --ssh-url`；loomy chat 的 preamble 会从本地 git 上下文自动注入
   - 不要用 `--quiet` / `--json`，默认流式输出便于用户实时看到 hermes 处理过程

2. dispatch 返回后，把 hermes 的最终回复要点（成功 / 失败、合入 commit、失败原因等）摘到 review 报告末尾「远程合入结果」小节。

3. `loomy chat` 自身失败（网络中断、credential 失效、gateway 不可达）→ 记录失败原因并提示用户手动处理，不自动重试。

Never auto-dispatch merge-to-main without the Phase 7 combined confirmation.

## Error handling

If any phase command fails:
- record the failure under that phase
- continue the rest of the review when possible
- mention the failure in the final conclusion as a caveat

Examples:
- network failure on `git fetch`
- script failure
- lint timeout
- missing file
- merge conflict during optional `git merge origin/main`

## Anti-patterns

- ❌ Auto-invoking without an explicit merge-review trigger (`/merge-review`, `$merge-review`, `merge-review`, or equivalent natural language)
- ❌ 跳过 Pre-flight 的埋点评估，或在评估出应埋未埋点时不调用 tracking-assistant
- ❌ 绕过 tracking-assistant 的 Step 2 用户逐条确认，直接替它写埋点代码
- ❌ 因埋点基础设施缺失就中止整个 review（应记一行跳过原因后继续）
- ❌ Treating script output as proof instead of heuristic evidence
- ❌ Aborting the entire review because one command failed
- ❌ Skipping Phase 1 for "small changes"
- ❌ Writing "probably fine" without reading the code
- ❌ Generating boilerplate findings
- ❌ Rating everything Minor to avoid blocking the MR
- ❌ Automatically committing or pushing without explicit confirmation
- ❌ 把 Phase 7 的合并确认拆成两次问（commit/push 一次 + 远程合入 main 一次）；必须在同一个 yes/no 里覆盖所有副作用步骤
- ❌ Phase 8 再独立向用户确认；其确认已在 Phase 7 一并完成
- ❌ Running Phase 8 when review 结论为 ❌ Not ready / Phase 7 push 未成功 / loomy 未安装 / 用户在 Phase 7 拒绝
- ❌ Relying on remembered AGENTS rules instead of reading the current file
