# Workspace Detection

## Purpose
Establish the full workspace context before any other stage begins. This stage ensures the AI knows exactly where all assets are, whether this is a fresh start or a resume, and which style reference file to use.

---

## Steps to Execute

### 1. Log Initial User Request
Before doing anything else, append the user's full raw request to `aidlc-docs/audit.md`:

```markdown
## Workspace Detection
**Timestamp**: [ISO timestamp]
**User Input**: "[Complete raw user input — never summarized]"
**AI Response**: "Starting Workspace Detection"
**Context**: Fresh start — beginning QA-DLC workflow

---
```

### 2. Detect Repo Root
- Auto-detect the repo root directory name from the workspace path
- Record the detected root in `aidlc-docs/qa-state.md` under `Repo Root`
- Do NOT hardcode the repo name anywhere — it must be auto-detected at runtime

### 3. Check for Existing Session
- Check for `aidlc-docs/qa-state.md`
  - **Found** → Read it, present the Welcome Back prompt from `common/session-continuity.md`, and resume
  - **Not found** → This is a fresh start; initialize `aidlc-docs/qa-state.md` and proceed

### 4. Detect Story Input Source and Normalize to `aidlc-docs/inception/user-stories/`

The workflow supports three input modes. Auto-detect which mode applies by inspecting the user's raw request. Apply the first matching rule:

---

#### Mode A — Jira Mode
**Trigger**: The user's request contains one or more Jira issue keys matching the pattern `[A-Z]+-[0-9]+` (e.g., `CLM-123`, `PROJ-456`).

**Steps**:
1. For each key found in the request:
   - Fetch the issue via the Jira MCP tool
   - Determine the issue type:
     - **Story / Task / Sub-task**: treat it as a single user story
     - **Epic**: fetch the epic's **direct child issues** (one level deep only — do not recurse into sub-tasks of children)
2. For each issue to be used as a story input:
   - Extract: issue key, summary, description, and any acceptance criteria fields
   - Write a normalized `.md` file to `aidlc-docs/inception/user-stories/[ISSUE-KEY].md` using this template:
     ```markdown
     # [ISSUE-KEY]: [Summary]

     **Type**: [Issue Type]
     **Status**: [Status]
     **Assignee**: [Assignee or Unassigned]

     ## Description
     [Full description text]

     ## Acceptance Criteria
     [Acceptance criteria field content, or "Not specified" if empty]

     ## Labels / Components
     [Labels and components if present]
     ```
3. After writing all files, list the filenames created.
4. If a Jira key is not found or the MCP fetch fails, **stop and alert the user**:
   ```
   "Could not fetch [ISSUE-KEY] from Jira. Please verify the key is correct and that Jira access is available."
   ```

---

#### Mode B — Folder Mode
**Trigger**: The user's request contains a file system path (absolute or relative, e.g., `/docs/stories/`, `./feature-docs`).

**Steps**:
1. List all files in the specified folder (non-recursive by default — read only top-level files unless the user specifies otherwise)
2. For each file, read its content (support any readable file type: `.md`, `.txt`, `.pdf`, `.docx`, etc.)
3. Write a normalized `.md` file to `aidlc-docs/inception/user-stories/[original-filename].md`:
   - If the source file is already `.md`: copy content as-is
   - If the source file is another format: extract readable text, write it under a `## Content` heading
4. After writing all files, list the filenames created.
5. If the specified folder does not exist or is empty, **stop and alert the user**:
   ```
   "No files found at [path]. Please verify the folder path and try again."
   ```

---

#### Mode C — Default Mode
**Trigger**: No Jira key pattern and no folder path detected in the user's request.

**Steps**:
1. Check that `aidlc-docs/inception/user-stories/` exists and contains at least one file
2. If the directory is empty or missing, **stop and alert the user**:
   ```
   "No user stories found in aidlc-docs/inception/user-stories/.
   Please add story files, provide a Jira issue/epic key, or specify a folder path."
   ```
3. Use the existing files as-is — no normalization needed

---

#### After Any Mode: Confirm Input Files
Regardless of which mode ran, confirm that `aidlc-docs/inception/user-stories/` now contains at least one `.md` file before proceeding. List all story files found (filenames only — full reading happens in Story Analysis).

### 5. Verify Step Definition Classes
- Check that `<framework-root>/src/test/.../steps/` exists and contains at least one step definition file
  > **Note**: The exact path depends on your framework's directory layout. For a standard Maven/Gradle project it is typically `src/test/java/<your-package>/steps/`. Auto-detect or confirm this path from the workspace structure.
- If missing or empty, **stop and alert the user**:
  ```
  "No step definition classes found in <framework-root>/src/test/.../steps/.
  Step definitions are required to build the step inventory."
  ```
- List the step definition class files found (filenames only — full reading happens in Step Inventory)

### 6. Determine Style Reference Feature File

#### If the user specifies a style reference file:
- Use the file they specified
- Verify it exists at the given path; if not, alert the user

#### If no style reference is specified:
- Scan `<framework-root>/src/test/.../features/` recursively for `.feature` files
  > **Note**: Adjust this path to match your framework's feature file root (e.g., `src/test/resources/<your-package>/features/`).
- Auto-select the most relevant file based on the component/domain of the user stories:
  - Match directory names or file names against story content or project tags
  - If no clear domain match, select the most recently modified `.feature` file as a general style reference
- Document the selected file and the reason for selection in `gherkin_plan.md` and in `audit.md`

### 7. Initialize `aidlc-docs/qa-state.md`
Create or update the state file with current session info:

```markdown
# QA-DLC Session State

## Session Info
- **Repo Root**: [auto-detected]
- **Started**: [ISO timestamp]
- **Last Updated**: [ISO timestamp]

## Phase & Stage
- **Current Phase**: DISCOVERY
- **Current Stage**: Workspace Detection
- **Stage Status**: IN_PROGRESS

## Completed Stages
- [ ] Workspace Detection
- [ ] Story Analysis
- [ ] Convention Extraction
- [ ] Step Inventory
- [ ] Gherkin Plan
- [ ] Feature File Generation
- [ ] Cross-Feature Consistency Check

## Input Source
- **Mode**: JIRA | FOLDER | DEFAULT
- **Source**: [Jira key(s) / folder path / aidlc-docs/inception/user-stories/]
- **Files Written**: [list of .md filenames created, or "pre-existing"]

## Gherkin Plan Status
- **Plan Approved**: NO
- **Feature Files Written**: 0 of 0

## Open Questions
<!-- None yet -->

## Style Reference File
- **File Used**: [filename.feature]
- **Reason Selected**: [brief rationale or "User specified"]

## Notes
```

### 8. Log Findings
Append to `aidlc-docs/audit.md`:

```markdown
## Workspace Detection — Findings
**Timestamp**: [ISO timestamp]
**Input Mode**: [JIRA / FOLDER / DEFAULT]
**Input Source**: [Jira key(s) / folder path / aidlc-docs/inception/user-stories/]
**User Stories Found**: [list of filenames in aidlc-docs/inception/user-stories/]
**Step Definition Classes Found**: [list of filenames]
**Style Reference File**: [selected filename] — [reason]
**Resume or Fresh Start**: [FRESH / RESUME]
**AI Response**: "Workspace Detection complete. Proceeding to Story Analysis."
**Context**: Workspace Detection complete

---
```

---

## Completion Message

After completing all steps above, present this message to the user:

```
✅ Workspace Detection complete.

- Repo root: [auto-detected root]
- Input mode: [JIRA / FOLDER / DEFAULT] ([source description])
- User stories found: [N] files
- Step definition classes found: [N] files
- Style reference: [filename.feature] ([reason])

Proceeding automatically to Story Analysis...
```

Then immediately begin Story Analysis — no user input required to advance.

---

## Error Conditions

| Condition | Action |
|---|---|
| `aidlc-docs/inception/user-stories/` missing or empty (default mode) | Stop and alert user — cannot proceed |
| Jira key not found or MCP fetch fails (Jira mode) | Stop and alert user — verify key and Jira access |
| Jira epic has no direct child issues (Jira mode) | Stop and alert user — epic appears to have no child stories |
| Specified folder path does not exist or is empty (folder mode) | Stop and alert user — verify the path |
| `<framework-root>/src/test/.../steps/` missing or empty | Stop and alert user — cannot proceed |
| `<framework-root>/src/test/.../features/` missing or contains no `.feature` files | Warn user; ask them to specify a style reference file manually |
| User-specified style reference file not found | Stop and alert user — ask them to verify the path |
