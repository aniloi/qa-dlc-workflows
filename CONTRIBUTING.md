# Contributing to QA-DLC Workflows

Thank you for your interest in contributing! This project is open to improvements, bug fixes, and additions that help QA engineers author better Gherkin tests with AI assistants.

---

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](https://github.com/aniloi/qa-dlc-workflows/issues) to report bugs or suggest improvements.
- Include: what you expected, what actually happened, which AI assistant you were using, and the relevant workflow stage.

### Proposing Changes

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes (see guidelines below).
4. Commit with a clear message: `git commit -m "feat: describe what you changed"`
5. Push and open a Pull Request against `main`.

---

## Contribution Guidelines

### Rule Detail Files (`.qa-dlc-rule-details/`)

- Keep instructions **generic** — no framework-specific paths, company names, or tool-specific assumptions.
- Use `<placeholder>` syntax for any path or value that varies by project (e.g., `<framework-root>/src/test/.../steps/`).
- Each rule detail file should be self-contained and readable in isolation.
- Do not introduce contradictions between rule files — test your changes end-to-end with an AI assistant before submitting.

### Core Workflow (`qa-dlc-core/core-workflow.md`)

- The two-phase structure (Discovery → Execution) must be preserved.
- The plan-approval gate (no `.feature` files before `gherkin_plan.md` is approved) is non-negotiable.
- If you add a new stage, add it to both the phase header and the stage execution block, and add a corresponding rule detail file.

### README and Documentation

- Keep Quick Start instructions accurate and tested.
- Per-agent setup sections must reflect actual agent behavior (test with the real agent before documenting).
- Attribution to `awslabs/aidlc-workflows` must be preserved.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Questions?

Open a [Discussion](https://github.com/aniloi/qa-dlc-workflows/discussions) or file an issue with the `question` label.
