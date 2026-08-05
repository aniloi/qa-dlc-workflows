#!/usr/bin/env bun
// qadlc-sensor-tag-policy.ts — every shipping scenario must carry ≥1 scope tag
// AND ≥1 component tag (effective tags = scenario tags ∪ feature tags).
//
// State-aware Jira rule: when the session was started from a Jira key
// (qa-state.md `story_source` is Jira mode), every scenario must ALSO carry an
// `@allure.label.jira=<ISSUE-KEY>` tag. For file/folder input the tag is
// optional. This mirrors the qa_automation team convention and makes it a
// deterministic check rather than a remembered rule.
//
//   bun qadlc-sensor-tag-policy.ts --stage <slug> --file-path <path>

import { existsSync, readFileSync } from "node:fs";
import { parseArgs, printJson, type Finding } from "./qadlc-sensor-lib.ts";
import { parseFeature, realScenarios } from "./qadlc-gherkin.ts";
import { resolveProjectRoot } from "./qadlc-lib.ts";
import { readState } from "./qadlc-state.ts";

const SCOPE_TAGS = new Set(["@smoke", "@regression", "@e2e", "@exploratory"]);
const JIRA_TAG = /^@allure\.label\.jira=.+/;

// A session is "Jira mode" when its recorded story_source names Jira (the
// workspace-detection stage records the input mode). Absent state → not Jira,
// so the allure tag stays optional (advisory-safe default).
function isJiraMode(): boolean {
  const state = readState(resolveProjectRoot(import.meta.url));
  return !!state && /jira/i.test(state.story_source);
}

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qadlc-sensor-tag-policy");
  if (!filePath.endsWith(".feature")) process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const f = parseFeature(readFileSync(filePath, "utf-8"));
  const findings: Finding[] = [];
  const jiraMode = isJiraMode();

  for (const s of realScenarios(f)) {
    const tags = new Set<string>([...f.tags, ...s.tags]);
    const scopeTags = [...tags].filter((t) => SCOPE_TAGS.has(t));
    const jiraTags = [...tags].filter((t) => JIRA_TAG.test(t));
    // Component tags = anything that is neither a scope tag nor the Jira label.
    const componentTags = [...tags].filter((t) => !SCOPE_TAGS.has(t) && !JIRA_TAG.test(t));
    if (scopeTags.length === 0) {
      findings.push({ line: s.line, rule: "missing-scope-tag", message: `"${s.name}" has no scope tag (${[...SCOPE_TAGS].join(", ")})` });
    }
    if (componentTags.length === 0) {
      findings.push({ line: s.line, rule: "missing-component-tag", message: `"${s.name}" has no component tag` });
    }
    if (jiraMode && jiraTags.length === 0) {
      findings.push({ line: s.line, rule: "missing-jira-tag", message: `"${s.name}" is missing @allure.label.jira=<ISSUE-KEY> (session started from a Jira key)` });
    }
  }

  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
