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
 * - `bullets` extends `preserve` rather than restating it. The inheritance is
 *   load-bearing documentation: it says the flagship preset is the
 *   round-tripping baseline plus transforms, not a separate pipeline.
 *
 * - Both ship with empty transform lists until the transforms themselves land.
 *   `preserve` stays empty permanently — parse then render already round-trips,
 *   so the empty pipeline *is* the preset rather than a stub of one.
 */
export const BUILT_IN_PRESETS = {
  bullets: {
    extends: ["preserve"],
    transforms: [],
  },
  preserve: {
    transforms: [],
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
