---
name: multi-model-research
description: Run structured multi-model research (Claude, Gemini, Codex) and synthesize consensus, disagreements, and final recommendations.
---

# Multi-Model Research

Use this skill for architecture choices, tradeoff analysis, or high-stakes technical decisions.

## Use When

- The user asks for multi-model research, technology selection, or architecture comparison
- A decision has competing options and needs cross-model critique
- You need confidence checks before implementation

## Workflow

1. Define the research question:
   - Decision to make
   - Constraints
   - Evaluation criteria (performance, maintainability, cost, risk)
2. Query providers with the same prompt template:
   - `omc ask claude "<question>"`
   - `omc ask gemini "<question>"`
   - `omc ask codex "<question>"`
3. Normalize each answer into:
   - Proposed approach
   - Key arguments
   - Risks and unknowns
4. Synthesize:
   - Consensus points
   - Contradictions
   - Missing evidence
   - Final recommendation with rationale
5. Record artifacts and next validation steps.

## Quality Rules

- Keep prompts equivalent across models to reduce bias.
- Cite concrete evidence, not authority.
- Separate facts from inference.
- If a provider is unavailable, continue and clearly state the reduced confidence.

## Output Format

- Research question and criteria
- Per-model findings
- Consensus and disagreements
- Recommended decision
- Validation checklist and follow-up experiments

