// scripts/onboarding.ts — the shared onboarding-doc renderer.
//
// One hand-authored skeleton (core/templates/onboarding.md) renders into every
// harness's shipped onboarding doc (QA-CLAUDE.md / QA-AGENTS.md / etc.). The
// skeleton carries:
//   - {{HARNESS_DIR}} — the harness dir token, left UNSUBSTITUTED here so the
//     packager's single sanctioned transform() (+ rules-rename) handles it,
//     exactly like every other core/ .md. This module never touches it.
//   - {{INVOKE}} — the invoke phrase (e.g. "Using QA-DLC"), substituted here.
//   - {{SLOT:<name>}} — named per-harness slots, filled from the harness's
//     onboarding.fills.ts. A slot with no fill renders empty (intentional
//     "section omitted"); an UNKNOWN {{SLOT:...}} left in the output throws —
//     that is the "a new harness gets a complete doc, provably" guard.
//
// Both consumers import renderOnboarding(): package.ts and any harness emit.ts.
// Adding a harness = author one fills file; the skeleton and this renderer are
// untouched.

/** Per-harness fill set: the invoke phrase + the slot bodies. */
export type OnboardingFills = {
  /** The invoke phrase this harness documents, e.g. "Using QA-DLC". */
  invoke: string;
  /**
   * Slot name → markdown body. A slot listed in the skeleton but absent here
   * renders to empty (the section is intentionally omitted for this harness).
   * Bodies should NOT carry a trailing newline; the renderer manages spacing.
   */
  slots: Record<string, string>;
};

/** Every {{SLOT:<name>}} marker the skeleton declares, for validation. */
export function declaredSlots(skeleton: string): string[] {
  const out = new Set<string>();
  for (const m of skeleton.matchAll(/\{\{SLOT:([a-z_]+)\}\}/g)) out.add(m[1]);
  return [...out];
}

/**
 * Render the onboarding skeleton for one harness. Returns markdown with
 * {{HARNESS_DIR}} STILL PRESENT (the caller's transform substitutes it).
 *
 * Throws if the rendered output still contains a {{SLOT:...}} or {{INVOKE}}
 * marker — that can only happen if the skeleton declares a slot the fills omit
 * AND the renderer failed to blank it, i.e. a real bug. This is the
 * completeness guarantee.
 */
export function renderOnboarding(skeleton: string, fills: OnboardingFills): string {
  let out = skeleton;

  // Fill named slots. A slot marker alone on its line is removed cleanly (line
  // + trailing newline) so an omitted section leaves no blank-line scar; a
  // non-empty fill replaces the marker in place.
  for (const name of declaredSlots(skeleton)) {
    const body = fills.slots[name] ?? "";
    const loneLine = new RegExp(`^\\{\\{SLOT:${name}\\}\\}\\n`, "m");
    if (body === "" && loneLine.test(out)) {
      out = out.replace(loneLine, "");
    } else {
      out = out.split(`{{SLOT:${name}}}`).join(body);
    }
  }

  // Substitute the invoke phrase.
  out = out.split("{{INVOKE}}").join(fills.invoke);

  // Completeness guard: no slot/invoke marker may survive.
  const leftover = out.match(/\{\{SLOT:[a-z_]+\}\}|\{\{INVOKE\}\}/);
  if (leftover) {
    throw new Error(
      `onboarding render incomplete: marker ${leftover[0]} survived for invoke="${fills.invoke}". ` +
        `Every {{SLOT:...}} the skeleton declares must be fillable.`,
    );
  }

  // Strip per-line trailing whitespace, collapse 3+ blank lines to 2, ensure a
  // single trailing newline.
  out = out.replace(/[ \t]+$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.replace(/\n*$/, "\n");
}
