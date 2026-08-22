# Findings

## Current OMC architecture

- Source config currently models `artifacts`, optional `mapping`, and optional `role`.
- Artifact system is fixed around `skills`, `agents`, `hooks`, `commands`, `guidelines`, `settings`, and `hud`.
- `setup` already supports:
  - role-based skip for `reference`
  - install manifest
  - prune of previously managed paths
  - `guidelines` aliasing from legacy `claude-md`

## Current limitation

- OMC assumes sources are already shaped like OMC artifact directories.
- There is no normalized catalog layer between external source layout and install/apply.
- There is no concept of harness-specific surfaces or install profiles.

## ECC characteristics relevant to design

- ECC is a multi-harness distribution repo, not just a skill repo.
- It publishes multiple surfaces in one package: plugin manifests, harness directories, commands, hooks, rules, schemas, and scripts.
- It exposes manifest-like metadata via `.claude-plugin/plugin.json`, `package.json`, and `agent.yaml`.

## Design direction

- Preserve current apply/install logic as the downstream layer.
- Add upstream layers:
  1. source kind and bundle metadata
  2. manifest discovery
  3. normalized catalog
  4. profile-driven install planning

## Implemented in this session

- Source schema now carries:
  - `kind`
  - `harnesses`
  - `manifests`
  - `profiles`
- Sync now caches declared manifest files under source metadata.
- New catalog path normalizes sources into surfaces:
  - runtime
  - reference
  - tooling
  - manifest
  - harness-specific
- New plan path emits profile-driven actions for:
  - `claude-runtime`
  - `reference-only`
- Next layer is plan materialization:
  - write source activation state
  - keep audit metadata
  - do not jump to item-level curation yet

## Plan apply behavior

- `plan apply <source> --profile claude-runtime`
  - sets `installMode=auto`
  - clears `role=reference`
  - narrows `artifacts` to selected runtime artifact types
  - writes `.omc-source/last-plan-apply.json`
- `plan apply <source> --profile reference-only`
  - sets `installMode=planned`
  - sets `role=reference`
  - clears active runtime artifacts
  - keeps the source inspectable without making it installable

## Item-level curation

- Source config now supports `allowlist` keyed by artifact type.
- `setup` and `artifact list` filter source items through that allowlist.
- `plan apply --selection-file ...` validates requested names against plan
  candidates and persists the result as a source-level allowlist.
- For manifest-driven surfaces where the catalog has only counts (no
  `itemNames`), validation is deferred to `setup`'s real on-disk filter so
  curation does not silently fail.

## Architecture review (2026-04-27)

End-to-end ingestion of `everything-claude-code` verified: 183 skills, 48
agents, 79 commands sync, plan, apply, and flow through `setup --dry-run`.

Issues found and fixed:

- `plan apply --profile reference-only` cleared `artifacts: []`, breaking
  round-trip to `claude-runtime` for content-repos. The catalog also gated
  `installable` on the current `role`, which prevented `plan install` from
  modeling the transition out of reference. Both were fixed in
  `src/catalog/source-catalog.js` (`installable` is now intrinsic) and
  `src/cli/plan.js` (passes current source artifacts into
  `deriveSourceActivation`). Install-side gating still lives in
  `setup.js` / `artifact.js` (`role==='reference'` + `installMode!=='auto'`).
- `extractAllowlistFromSelection` rejected any name not in `action.itemNames`,
  but manifest-driven surfaces never expand item names. Fixed: validation only
  runs when the catalog actually expanded names; otherwise the selection is
  trusted and `setup`'s `filterItemsByAllowlist` enforces membership against
  real on-disk content. The accept-without-validation path emits a `warn:` on
  stderr.
- `doctor` silently skipped any source with `installMode!=='auto'`, so freshly
  added distribution-repos were invisible. Fixed: doctor now reports staged
  sources with a `plan apply` hint, and shows `kind`, `appliedProfile`, and
  `allowlist` for each source.
