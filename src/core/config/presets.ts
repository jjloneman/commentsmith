/**
 * The presets Commentsmith ships with.
 *
 * - **No built-in preset reframes a comment.** The frame is captured from
 *   source and never derived, so a stack of line comments stays a stack unless
 *   a user explicitly asks otherwise. Silently turning someone's line comments
 *   into a block comment is what makes a formatter untrustworthy.
 */

import type { PresetTable } from "#core/config/types";

/**
 * Every preset available to `extends` out of the box.
 *
 * - `preserve` is the round-tripping baseline and stays empty permanently —
 *   parse then render already round-trips, so the empty pipeline *is* the
 *   preset rather than a stub of one.
 *
 * - Every other preset extends it rather than restating it. The inheritance is
 *   load-bearing documentation: it says each one is that baseline plus
 *   transforms, not a separate pipeline.
 *
 * - **`bullets` extends `preserve`, not `wrap`, even though its list ends with
 *   the same transform.** Resolution keeps an inherited entry at its inherited
 *   position and appends new names, so a `bullets` extending `wrap` would place
 *   sentence bulletizing *after* wrapping — and the bullets it produced would
 *   never be wrapped. Order cannot be expressed through `extends`, so the
 *   preset that cares about order states its own list.
 */
export const BUILT_IN_PRESETS = {
  bullets: {
    extends: ["preserve"],
    transforms: [{ name: "body/bulletize-sentences" }, { name: "body/rewrap" }],
  },
  preserve: {
    transforms: [],
  },
  wrap: {
    extends: ["preserve"],
    transforms: [{ name: "body/rewrap" }],
  },
} satisfies PresetTable;

/**
 * The name of a preset Commentsmith ships.
 *
 * - Derived from the table rather than re-spelled, so adding a preset widens
 *   the type and removing one breaks every reference at compile time.
 *
 * @example "bullets"
 */
export type BuiltInPresetName = keyof typeof BUILT_IN_PRESETS;
