# Changelog Entry Template

Save to `docs/changelog/{YYYY-MM-DD}/{branch-name}.md`. Every section must reflect real findings from the review, not generic placeholders.

```markdown
# {分支名} 变更总结

**日期**: {YYYY-MM-DD HH:mm}
**分支**: {BRANCH_NAME}
**作者**: {git config user.name}
**Commits**: {COMMIT_COUNT} 个

## 功能概述

用 1-3 句话描述本次分支的核心目的和改动。

## 改动范围

| 文件 | 变更类型 | 说明 |
|---|---|---|
| path/to/file1.jsx | 新增 / 修改 / 删除 | 一句话描述改了什么 |
| path/to/file2.js | 修改 | 一句话描述 |

## 影响面

**直接改动模块**：
- module1 — 改动说明

**间接影响模块**（通过 import/依赖关联）：
- consumer1.jsx — 使用了 `exportName`，需关注兼容性
- consumer2.js — 导入了 `moduleName`

## 能力域影响面（QA 视角）

> 按用户/QA 能感知的能力维度归类。出现"X 功能不工作"反馈时，按能力域反查改动点。

### {能力域名}
- **本次改了什么**：1-2 句
- **可能破坏的场景**：基于 diff 推出的具体风险（不是"可能有问题"这种空话）
- **关联文件**：path1, path2
- **建议回归动作**：1-3 条具体可执行测试

### {下一个能力域}
...

如果本次确实只改动文档/配置/构建脚本等不影响用户感知能力的内容，写"无能力域影响"。

## 特殊逻辑与注意事项

列出本次变更中需要特别关注的逻辑，比如：
- 非直觉的实现选择及其原因
- 临时方案或 workaround（标注后续计划）
- 对已有行为的改变（breaking change）
- 并发/竞态/时序相关的逻辑
- 性能敏感的改动

如果没有特殊逻辑，写"无"。

## Review 结论

**状态**: ✅ Ready / ⚠️ With fixes / ❌ Not ready

**遗留问题**：
- （如有，列出 Critical/Important 问题）
```
