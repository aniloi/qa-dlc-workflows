# Gherkin Glossary (shared knowledge)

> Tier-1 knowledge: loaded by every agent regardless of stage.

- **Feature** — a top-level grouping of related behavior; one `.feature` file.
- **Scenario** — a single, self-contained behavior example (Given/When/Then).
- **Scenario Outline** — a parameterized scenario driven by an `Examples` table;
  use at ≥3 data variations.
- **Background** — setup steps shared by *every* scenario in the file.
- **Step** — a `Given` (precondition), `When` (action), or `Then` (expected
  outcome). `And`/`But` continue the previous keyword's clause.
- **Step definition** — the code (Cucumber glue) that implements a step. QA-DLC
  never modifies these; it reuses them.
- **Declarative style** — describes *what* the system does; the opposite of
  *imperative* (clicking through the UI).
- **Tag** — an `@label` on a Feature or Scenario used to select/route tests.
