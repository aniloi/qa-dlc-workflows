# Gherkin Author — Knowledge

> Tier-2 knowledge: loaded only when the gherkin-author-agent leads a stage.

## Scenario patterns

- **Happy path**: the primary success flow, one scenario, `@smoke`.
- **Negative**: invalid input / unauthorized / not-found, `@negative @regression`.
- **Boundary**: min/max/empty/limit values — often a `Scenario Outline`.
- **State-dependent**: same action, different starting state (e.g. empty cart vs.
  full cart) — separate scenarios or an outline.

## Choosing Scenario vs. Scenario Outline

Count the data variations that exercise the *same* Given/When/Then shape. ≥3 →
`Scenario Outline` with an `Examples` table and `<placeholders>` in the steps.
1–2 → separate named `Scenario`s (clearer failures).

## Reuse discipline

Before writing a step, search the step inventory / catalog. If a step is close
but not exact, do NOT reword it or clone it — raise it as an Open Question in the
plan. New steps must be listed under "New Step Definitions Required" and approved.

## Depth mapping

Minimal = happy path only. Standard = + primary negative. Comprehensive = +
boundary + data-driven + edge. See `depth-levels.md`.
