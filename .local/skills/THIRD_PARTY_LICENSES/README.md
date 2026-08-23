# Third-Party Skill Attribution

The following skills were vendored from external open-source repositories.
The full applicable upstream license texts are preserved in this directory and
must remain shipped with `claudecode-omc`.

| Vendored skill (`.local/skills/<dir>`) | Source repository | Source commit | License file |
|---|---|---|---|
| `ios-debugger-agent` | [Dimillian/Skills](https://github.com/Dimillian/Skills) | `05ba982` | [Dimillian-Skills.LICENSE](./Dimillian-Skills.LICENSE) |
| `swift-concurrency-expert` | [Dimillian/Skills](https://github.com/Dimillian/Skills) | `05ba982` | [Dimillian-Skills.LICENSE](./Dimillian-Skills.LICENSE) |
| `swiftui-liquid-glass` | [Dimillian/Skills](https://github.com/Dimillian/Skills) | `05ba982` | [Dimillian-Skills.LICENSE](./Dimillian-Skills.LICENSE) |
| `swiftui-performance-audit` | [Dimillian/Skills](https://github.com/Dimillian/Skills) | `05ba982` | [Dimillian-Skills.LICENSE](./Dimillian-Skills.LICENSE) |
| `swiftui-ui-patterns` | [Dimillian/Skills](https://github.com/Dimillian/Skills) | `05ba982` | [Dimillian-Skills.LICENSE](./Dimillian-Skills.LICENSE) |
| `swiftui-view-refactor` | [Dimillian/Skills](https://github.com/Dimillian/Skills) | `05ba982` | [Dimillian-Skills.LICENSE](./Dimillian-Skills.LICENSE) |
| `swiftui-pro` | [twostraws/swiftui-agent-skill](https://github.com/twostraws/swiftui-agent-skill) | `be297ff` | [twostraws-swiftui-agent-skill.LICENSE](./twostraws-swiftui-agent-skill.LICENSE) |
| `swiftui-expert-skill` | [AvdLee/SwiftUI-Agent-Skill](https://github.com/AvdLee/SwiftUI-Agent-Skill) | `a4d7692` | [AvdLee-SwiftUI-Agent-Skill.LICENSE](./AvdLee-SwiftUI-Agent-Skill.LICENSE) |
| `eli5` | [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/eli5/skills/eli5) | `f4c9452f5ca091f1be7064d9faab1b001ea21645` | [Anthropic-claude-plugins-community.LICENSE](./Anthropic-claude-plugins-community.LICENSE) |

## Copyright holders

- **Dimillian/Skills** — Copyright (c) 2026 Thomas Ricouard — MIT
- **twostraws/swiftui-agent-skill** — Copyright (c) 2026 Paul Hudson — MIT
- **AvdLee/SwiftUI-Agent-Skill** — Copyright (c) 2026 Antoine van der Lee — MIT
- **anthropics/claude-plugins-community** — Apache License 2.0

## Vendoring notes

- Only the iOS/SwiftUI-relevant subset of `Dimillian/Skills` was vendored;
  non-iOS skills (React, GitHub, review/refactor swarms, etc.) were excluded.
- From `twostraws/swiftui-agent-skill`, the marketplace-packaging artifacts
  (`.claude-plugin/`) and the divergent nested `skills/swiftui-pro/` duplicate
  were excluded; only the canonical top-level skill + `references/` were taken.
- From `AvdLee/SwiftUI-Agent-Skill`, only `swiftui-expert-skill/` was vendored;
  the `update-swiftui-apis` helper was excluded because it requires the
  external Sosumi MCP server.
- The iOS / Swift / SwiftUI skill content was vendored verbatim; only placement
  under `.local/skills/` differs from upstream layout.
- `eli5` changes the upstream `<topic>` frontmatter placeholder to `[topic]` so
  the skill passes cross-harness metadata validation. Its instruction body is
  otherwise unchanged, and the modified file carries the same notice.
