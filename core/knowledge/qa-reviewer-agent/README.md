# QA Reviewer — Knowledge

> Tier-2 knowledge: loaded only when the qa-reviewer-agent leads/supports a stage.

## Convention extraction checklist

- Step wording + parameterization style
- `Background` vs. inline setup usage
- Tag vocabulary actually in use (feed `memory/project.md`)
- Data-table / `Scenario Outline` conventions
- File + scenario naming
- Abstraction level (declarative vs. procedural)

## Cross-feature review checklist

- No duplicate scenario names across files (the `duplicate-scenario-name` sensor
  is the machine check; confirm its findings).
- No conflicting or near-duplicate step wordings.
- Tag policy holds on every scenario (the `tag-policy` sensor checks this).
- Naming convention consistent (`kebab-case.feature`).
- Abstraction level uniform across the new suite.

## Reading sensor findings

Sensor detail files land in `aidlc-docs/.qa-dlc-sensors/<stage>/`. Treat them as a
second opinion: confirm true positives, and for a false positive, consider whether
the rule itself needs tuning (a learning-loop candidate).
