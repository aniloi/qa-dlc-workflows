# Question Format Guide

## MANDATORY: All Questions Must Use This Format

### Rule: Never Ask Questions Inline in Chat
**CRITICAL**: You must NEVER ask questions directly in the chat. ALL questions must be placed in dedicated question files under `aidlc-docs/`.

---

## Question File Format

### File Naming Convention
- Use descriptive names: `{stage-name}-questions.md`
- Examples:
  - `story-analysis-questions.md`
  - `gherkin-plan-questions.md`
  - `step-inventory-questions.md`

### Question Structure
Every question must include meaningful options. Add "Other" only when the user might have a valid answer not covered by the listed options:

```markdown
## Question [Number]
[Clear, specific question text]

A) [First meaningful option]
B) [Second meaningful option]
[...additional options as needed...]
X) Other (please describe after [Answer]: tag below)

[Answer]: 
```

**CRITICAL**:
- Only include meaningful options — don't make up options to fill slots
- Use as many or as few options as make sense (minimum 2)
- "Other" is optional — include it only when the option space is genuinely open-ended
- Never pad with vague or overlapping options

---

## Complete Example

```markdown
# Story Analysis Clarification Questions

Please answer the following questions to help clarify the user stories before generating the Gherkin plan.

## Question 1
Story US-3 describes "a user with an active account" — which account type does this refer to?

A) Individual brokerage account
B) Institutional account
C) Any account type (this behavior applies universally)
D) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 2
Should the scenario cover the case where the funding source is rejected mid-flow?

A) Yes — include a negative scenario for funding rejection
B) No — only happy-path for now
C) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 3
Which scope tag applies to the deposit flow scenarios?

A) @smoke — these are core and must run every deployment
B) @regression — thorough but not critical-path
C) Both — some scenarios are @smoke, others @regression

[Answer]: 
```

---

## User Response Format
Users answer by filling in the letter choice after `[Answer]:`:

```markdown
## Question 1
Story US-3 describes "a user with an active account" — which account type does this refer to?

A) Individual brokerage account
B) Institutional account
C) Any account type

[Answer]: C
```

---

## Workflow Integration

### Step 1: Create Question File
```
Create aidlc-docs/{stage-name}-questions.md with all Open Questions gathered during that stage.
```

### Step 2: Inform the User
```
"I've created {stage-name}-questions.md with [X] questions that need your input before I can proceed.
Please answer each question by filling in the letter choice after the [Answer]: tag.
If none of the options fit, choose 'Other' and describe your answer inline.
Let me know when you're done."
```

### Step 3: Wait for Confirmation
Wait for user to say "done", "answered", "finished", or similar.

### Step 4: Read and Analyze
```
Read aidlc-docs/{stage-name}-questions.md
Extract all answers after [Answer]: tags
Validate all questions are answered
Proceed with the stage using the provided answers
```

---

## Reading User Responses

After user confirms completion:
1. Read the question file
2. Extract answers after `[Answer]:` tags
3. Validate all questions are answered
4. Check for contradictions or ambiguities (see below)
5. Proceed with the stage only after all issues are resolved

---

## Error Handling

### Missing Answers
If any `[Answer]:` tag is empty:
```
"I noticed Question [X] is not answered. Please provide an answer before I can proceed."
```

### Invalid Answers
If answer is not a valid letter choice:
```
"Question [X] has an invalid answer '[answer]'. Please use one of the letter choices provided."
```

### Ambiguous Answers
If user provides a free-text explanation instead of a letter:
```
"For Question [X], please select the letter that best fits your intent.
If none apply, choose 'Other' and add your description after the [Answer]: tag."
```

---

## Contradiction and Ambiguity Detection

**MANDATORY**: After reading user responses, check for contradictions and ambiguities before proceeding.

### Detecting Contradictions in QA Context
Look for logically inconsistent answers:
- Story scope mismatch: "only happy-path" but "include all error conditions"
- Tag conflict: "@smoke" for a scenario that is clearly edge-case regression behavior
- Step reuse conflict: "use existing steps" but describing behavior with no matching step and no new step listed

### Detecting Ambiguities
Look for unclear or borderline responses:
- A story could apply to multiple account types and the user picked a specific one without explaining why
- A scope tag choice (e.g., @smoke vs. @regression) that seems inconsistent with the scenario's risk level
- A response that says "Other" without enough description to act on

### Creating Clarification Questions
If contradictions or ambiguities are detected:

1. **Create clarification file**: `aidlc-docs/{stage-name}-clarification-questions.md`
2. **Explain the issue**: Clearly state what contradiction or ambiguity was detected
3. **Ask targeted questions**: Use the same multiple-choice format to resolve it
4. **Reference original questions**: Show which questions had conflicting or unclear answers

**Example**:
```markdown
# Gherkin Plan Clarification Questions

I detected a contradiction in your responses that needs clarification:

## Contradiction 1: Scope vs. Tag
You indicated this scenario covers a rare error state (Q2: A), but also tagged it @smoke (Q3: A).
Smoke tags are reserved for core happy-path flows run on every deployment.

### Clarification Question 1
Which tag is correct for this scenario?

A) @regression — it's an edge case, not a smoke scenario
B) @smoke — this error state is critical enough to run every deployment
C) Other (please describe after [Answer]: tag below)

[Answer]: 
```

### Workflow for Clarifications
1. **Detect**: Analyze all responses for contradictions/ambiguities
2. **Create**: Generate clarification file if issues found
3. **Inform**: Tell user what was found and where the clarification file is
4. **Wait**: Do not proceed until user answers clarification questions
5. **Re-validate**: After clarifications, check again for consistency
6. **Proceed**: Only move forward when all contradictions are resolved

---

## Option Count Guidelines

| Options | When to use |
|---|---|
| 2 meaningful + optional Other | Binary decisions (yes/no, in/out of scope) |
| 3–4 meaningful + optional Other | Most QA decisions (tag choice, story scope, step selection) |
| 5 meaningful + optional Other | Only when all 5 are clearly distinct and likely |

**CRITICAL**: Do not add options just to reach A, B, C, D. Only include options that are genuinely applicable.

---

## QA-Specific Question Categories

Use these question types during Open Questions resolution:

| Category | When to Ask |
|---|---|
| **Story scope** | Story is ambiguous — could apply to one or many account/flow types |
| **Acceptance criterion** | Criterion is vague or contradicts another story |
| **Step reuse** | Existing step is close but not exact — ask whether to reuse or flag for a new step |
| **Tagging** | Unclear whether scenario is @smoke, @regression, or @e2e |
| **Data assumptions** | Test data or environment assumptions cannot be inferred from the codebase |
| **New step class** | New step doesn't clearly belong to any existing step definition class |

---

## Best Practices

1. **Be Specific**: Tie each question to a concrete story ID, step name, or acceptance criterion
2. **Be Comprehensive**: Gather all unknowns for a stage before asking — don't trickle questions one at a time
3. **Be Concise**: One question per issue — don't bundle two ambiguities into one question
4. **Be Practical**: Options should reflect real implementation choices, not theoretical ones
5. **Be Consistent**: Use the same format throughout all question files

---

## Summary

**Remember**:
- ✅ Always create question files in `aidlc-docs/`
- ✅ Always use multiple-choice format
- ✅ Only include meaningful, realistic options
- ✅ Include "Other" only when the space is genuinely open-ended
- ✅ Always use `[Answer]:` tags
- ✅ Always wait for user completion before proceeding
- ✅ Always validate responses for contradictions and ambiguities
- ✅ Always create clarification files if issues are found
- ✅ Always resolve contradictions before moving to the next stage
- ❌ Never ask questions inline in chat
- ❌ Never pad options to fill A, B, C, D slots
- ❌ Never proceed without all answers
- ❌ Never proceed with unresolved contradictions or ambiguities
