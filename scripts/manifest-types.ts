// scripts/manifest-types.ts — the shared contract every harness/<name>/manifest.ts
// implements, consumed by scripts/package.ts.
//
// A manifest is DATA: how to project the harness-neutral core/ tree into one
// dist/<name>/<harnessDir>/ tree. The only CODE a harness may contribute is an
// optional emit() plugin — structural divergence that no declarative row can
// express (e.g. a shell's native config file or hook registration format).

import type { OnboardingFills } from "./onboarding.ts";

/** A single core dir projected from core/<src> into <harnessDir>/<dst>. */
export type DirMap = { src: string; dst: string };

/**
 * An authored harness file copied from harness/<name>/<src> into the dist tree.
 * By default <dst> is relative to <harnessDir>/ (e.g. .kiro/skills/qadlc/SKILL.md).
 * Set projectRoot:true to land it at the dist tree ROOT instead, beside the
 * harness dir (e.g. dist/kiro/QA-AGENTS.md).
 */
export type FileMap = { src: string; dst: string; projectRoot?: boolean };

/**
 * Context handed to a harness emit() plugin — everything it needs to write
 * per-shell emissions without reaching back into the packager internals.
 */
export type EmitContext = {
  repoRoot: string;
  coreRoot: string;
  harnessRoot: string;
  distRoot: string;
  harnessDir: string;
  substituteToken: (s: string) => string;
  check: boolean;
};

/** The result of an emit() run: the files it owns, for the orphan scan + --check. */
export type EmitResult = {
  written: string[];
  problems: string[];
};

/**
 * How this harness's onboarding doc is generated from the shared skeleton
 * core/templates/onboarding.md. The packager renders the skeleton with these
 * fills, applies the standard {{HARNESS_DIR}} transform + rules-rename, and
 * writes it to <dst>. null when the harness generates it elsewhere (via emit)
 * or ships none.
 */
export type OnboardingSpec = {
  dst: string;
  projectRoot?: boolean;
  fills: OnboardingFills;
};

export type HarnessManifest = {
  /** Harness name; matches the dist/<name>/ and harness/<name>/ dir. */
  name: string;
  /** The harness directory the token substitutes to (".claude" | ".kiro" | ...). */
  harnessDir: string;
  /** core/<src> → <harnessDir>/<dst> projections. */
  coreDirs: DirMap[];
  /** harness/<name>/<src> → <harnessDir>/<dst> authored-file copies. */
  harnessFiles: FileMap[];
  /** How to render this harness's onboarding doc; null if generated elsewhere/none. */
  onboarding?: OnboardingSpec | null;
  /** Rename core's rules/ dir to this (kiro: "steering"); null keeps "rules". */
  rulesRename: string | null;
  /** Authored files allowed inside generated/copied dirs (skip the orphan scan). */
  authoredExempt: RegExp[];
  /** Skip the packager's standard runner-gen step. */
  skipRunnerGen?: boolean;
  /** Optional per-shell emission plugin. */
  emit: ((ctx: EmitContext) => EmitResult) | null;
};
