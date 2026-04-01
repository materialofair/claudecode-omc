---
name: ai-commenting
description: AI-native code annotation protocol that encodes intent, risk, dependencies, constraints, and test expectations in machine-parseable comments.
---

# AI Commenting Skill

Create and maintain AI-native annotations so coding agents can understand intent, risk, and constraints quickly and safely.

## When to Use

Use this skill when:
- introducing a new module with high coupling
- touching auth/payment/state consistency paths
- preparing codebase context for multi-agent implementation
- reducing repeated prompt context for long tasks

## Annotation Format

Canonical format:

```text
/*@ai:key=value|key=value|key=value*/
```

Rules:
- ASCII keys/values only
- `|` as field separator
- no spaces around `=`
- one annotation per scope (file or risky block)

## Field Schema

Core file-level fields:
- `risk=1-5`
- `core=<domain>`
- `deps=<A,B,C>`
- `intent=<why>`
- `test=<unit|integration|e2e|contract>`

Extended fields:
- `chain=<A->B->C>`
- `auth=<none|required|strict>`
- `security=<none|pii|payment|secret>`
- `invariant=<must_hold>`
- `sidefx=<db,cache,queue,event>`
- `perf=<budget>`
- `rollback=<strategy>`

## Risk Rubric

- `risk=1`: isolated local logic
- `risk=2`: low coupling, easy rollback
- `risk=3`: moderate coupling or external dependency
- `risk=4`: critical cross-module path
- `risk=5`: security/payment/core-state high blast radius

Escalate by +1 if auth/session/payment/PII/secrets are touched.

## Placement Strategy

1. File header annotation for critical modules
2. Block-level annotation only for risky functions

Keep annotations high-signal. Avoid tagging trivial code.

## Example

```typescript
/*@ai:risk=5|core=UserCRUD|intent=protect_user_consistency|deps=UserModel,AuthService,AuditService*/
/*@ai:chain=Auth->User->Permission->Audit|auth=strict|sidefx=db,event|test=integration|rollback=feature_flag*/
class UserManager {
  /*@ai:risk=4|invariant=user_id_unique|security=pii|perf=p95<200ms*/
  async deleteUser(userId: string) {
    // ...
  }
}
```

## Workflow

1. Discover high-risk boundaries
2. Add file-level core tags
3. Add targeted block-level tags
4. Validate syntax and consistency
5. Ensure `risk>=4` has explicit `test` and `rollback`

## Quality Gates

- all `risk>=4` files include file-level annotation
- `security!=none` implies `auth!=none`
- no contradictory tags per scope
- prefer 1 annotation per 60-120 LOC

## Parsing Helpers

```javascript
const aiTagPattern = /\/\*@ai:([^*]+)\*\//g;
const fieldPattern = /(\w+)=([^|*]+)/g;
```

## Output

Return a concise markdown report:
- Result summary
- Files changed
- Validation evidence
- Risks / next actions
