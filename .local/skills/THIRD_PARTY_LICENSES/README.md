# Third-Party Skill Attribution

The following iOS / Swift / SwiftUI skills were vendored from external
open-source repositories. Each is distributed under the **MIT License**.
The full upstream license text is preserved in this directory and must remain
shipped with `claudecode-omc` per the MIT terms.

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

## Copyright holders

- **Dimillian/Skills** — Copyright (c) 2026 Thomas Ricouard — MIT
- **twostraws/swiftui-agent-skill** — Copyright (c) 2026 Paul Hudson — MIT
- **AvdLee/SwiftUI-Agent-Skill** — Copyright (c) 2026 Antoine van der Lee — MIT

## Vendoring notes

- Only the iOS/SwiftUI-relevant subset of `Dimillian/Skills` was vendored;
  non-iOS skills (React, GitHub, review/refactor swarms, etc.) were excluded.
- From `twostraws/swiftui-agent-skill`, the marketplace-packaging artifacts
  (`.claude-plugin/`) and the divergent nested `skills/swiftui-pro/` duplicate
  were excluded; only the canonical top-level skill + `references/` were taken.
- From `AvdLee/SwiftUI-Agent-Skill`, only `swiftui-expert-skill/` was vendored;
  the `update-swiftui-apis` helper was excluded because it requires the
  external Sosumi MCP server.
- Upstream skill content was vendored verbatim (no edits to SKILL.md bodies);
  only placement under `.local/skills/` differs from upstream layout.
