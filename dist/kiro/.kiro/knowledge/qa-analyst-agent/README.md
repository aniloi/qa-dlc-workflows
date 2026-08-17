# QA Analyst — Knowledge

> Tier-2 knowledge: loaded only when the qa-analyst-agent leads a stage.

## Extracting acceptance criteria

- Prefer the story's own "Acceptance Criteria" section; if absent, derive
  criteria from the narrative and mark them as *implied*.
- Split compound criteria ("the user can create AND edit") into separate,
  testable statements.
- For a bug report (bugfix-repro scope), the criteria are: the observed wrong
  behavior (to reproduce) and the expected correct behavior (the fix guard).

## Building the step inventory

- Read step-definition annotations (`@Given`/`@When`/`@Then` in Java/Kotlin;
  decorators/attributes in other stacks) and record each pattern verbatim.
- Group by domain; note parameter types.
- Generate `aidlc-docs/.qadlc/step-catalog.json` with
  `qadlc-build-step-catalog.ts` — the human inventory above is for your reading,
  that file is the `step-existence` sensor's oracle. Never hand-write it: a
  catalog entry no definition backs makes an invented step pass the sensor, and no
  catalog at all makes the sensor advisory-pass every file.

## Ambiguity signals

Vague quantifiers ("some", "most"), undefined states ("logged in" without a
role), and missing error behavior are the most common gaps — raise them as Open
Questions rather than assuming.

## Using the project knowledge base

When the project ships a `kb/` (see `memory/project.md`), load the relevant
slices during Story Analysis (per `stage-protocol.md` §5): the index maps story
prefixes and domain keywords to sections; always read the glossary/agent-notes.
Use it to resolve domain terms and to surface **implied** acceptance criteria a
story author left unwritten — business rules, prerequisite states, and error
conditions that become `Given` setup and negative scenarios in the plan.
