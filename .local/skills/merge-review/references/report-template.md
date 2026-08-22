# Merge Review Report Template

Use this template to generate the final report. Every bullet must reflect real findings from the actual diff — no boilerplate or generic content.

```markdown
## Merge Review Report

**分支**: {BRANCH_NAME}
**Commits**: {COMMIT_COUNT} 个
**改动文件**: {FILE_COUNT} 个

---

### 1. 影响面分析

**改动文件**：
- path/to/file1.jsx
- path/to/file2.js

**反向影响文件**（依赖改动符号的消费方）：
- path/to/consumer1.jsx — 使用了 `exportName`
- path/to/consumer2.js — 导入了 `moduleName`

**并发改动**：
- ✅ 无冲突 / ⚠️ commit <sha> 触及同区域

**Features 文档状态**：
- docs/features/xxx.md — 存在 / 缺失

### 2. 合并就绪检查

| 检查项 | 状态 |
|---|---|
| 分支命名规范 | ✅ / ❌ |
| 已合并 origin/main | ✅ / ❌ |
| Commit message 质量 | ✅ / ❌ 列出问题 |
| Lint 通过 | ✅ / ❌ |

### 3. 回归自检

**已验证的契约和回归点**：
- [contract] export X still satisfies Y: verified by reading consumer Z
- [regression] empty input case: verified by reading code
- [coupling] store slice bar untouched

**未覆盖**（features doc 缺失的模块）：
- module_name — 无 features doc

### 4. 代码质量

**Strengths**：
- （具体优点，附 file:line）

**Issues**：

#### Critical
- （如有）

#### Important
- （如有）

#### Minor
- （如有）

### 5. 结论

**Ready to merge?** ✅ Yes / ⚠️ With fixes / ❌ No

**原因**：（1-2 句技术评估）

**需要修复**：
1. （Critical/Important 问题清单）
```
