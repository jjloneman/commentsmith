/**
 * Preset resolution — turning what a user wrote into what the runner consumes.
 *
 * - The merge rules are stated here once, because every downstream consumer
 *   would otherwise re-derive them: scalars are last-wins, a transform entry
 *   with an already-seen name merges its options over the inherited ones and
 *   **keeps the inherited position**, and a new name appends.
 *
 * - Position is preserved deliberately. An override that also reordered the
 *   pipeline would change behavior a user never asked to change, and pipeline
 *   order is the one thing a comment formatter cannot get wrong quietly.
 */

import type {
  Config,
  PresetTable,
  ResolvedConfig,
  ResolvedTransformEntry,
  TransformEntry,
} from "#core/config/types";

import { ConfigError } from "#core/config/errors";
import { BUILT_IN_PRESETS } from "#core/config/presets";
import { DEFAULT_PRINT_WIDTH } from "#core/config/types";
import { moduleLogger } from "#core/logger";

const logger = moduleLogger("config");

/**
 * The accumulator the `extends` layers fold into.
 *
 * - `transforms` is required here even though it is optional on {@link Config},
 *   so the fold never has to re-default a list it has already built.
 */
type MergedConfig = Pick<Config, "printWidth"> &
  Required<Pick<Config, "transforms">>;

/**
 * List a preset table's names for a diagnostic.
 *
 * @returns the names joined for display, or `"none"` when the table is empty.
 * @example describePresets(BUILT_IN_PRESETS) // "bullets, preserve"
 */
const describePresets = (presets: PresetTable): string => {
  const names = Object.keys(presets).sort();

  return names.length > 0 ? names.join(", ") : "none";
};

/**
 * Find a name one transform list uses more than once.
 *
 * @returns the offending name and both positions, or `undefined` when unique.
 * @example findDuplicateEntry([{ name: "a" }, { name: "a" }])?.second // 1
 */
const findDuplicateEntry = (
  entries: readonly TransformEntry[],
): { first: number; name: string; second: number } | undefined => {
  const positions = new Map<TransformEntry["name"], number>();

  for (const [index, entry] of entries.entries()) {
    const first = positions.get(entry.name);

    if (first !== undefined) {
      return { first, name: entry.name, second: index };
    }

    positions.set(entry.name, index);
  }

  return undefined;
};

/**
 * Expand one config's `extends` chain, ancestors first.
 *
 * @returns every config to merge, in application order, ending with `config`.
 */
const flattenExtends = ({
  applied,
  config,
  presets,
  trail,
}: {
  /**
   * Preset names already expanded, so a diamond applies its shared ancestor
   * once. Mutated as the walk proceeds, which is what makes it a single shared
   * record rather than one per branch.
   */
  applied: Set<string>;

  /** The config whose `extends` is being expanded. */
  config: Config;

  /** Every preset available to `extends`. */
  presets: PresetTable;

  /**
   * The preset names on the path to `config`, used to detect a cycle.
   *
   * @example ["bullets"]
   */
  trail: readonly string[];
}): Config[] => {
  const inherited = (config.extends ?? []).flatMap((name) =>
    expandPreset({ applied, name, presets, trail }),
  );

  return [...inherited, config];
};

/**
 * Expand a single named preset into the configs it contributes.
 *
 * - A cycle is reported with the whole path rather than as a bare "cycle
 *   detected", because the offending edge is rarely the one the user is looking
 *   at.
 *
 * @returns the preset's own chain, or nothing when it was already applied.
 * @throws ConfigError on a cycle or an unknown preset name.
 */
const expandPreset = ({
  applied,
  name,
  presets,
  trail,
}: {
  /** Preset names already expanded — see {@link flattenExtends}. */
  applied: Set<string>;

  /**
   * The preset being expanded.
   *
   * @example "bullets"
   */
  name: string;

  /** Every preset available to `extends`. */
  presets: PresetTable;

  /** The preset names on the path to this one. */
  trail: readonly string[];
}): Config[] => {
  if (trail.includes(name)) {
    throw new ConfigError(
      `preset "${name}" extends itself: ${[...trail, name].join(" -> ")}`,
    );
  }

  if (applied.has(name)) {
    return [];
  }

  const preset = presets[name];

  if (preset === undefined) {
    throw new ConfigError(
      `unknown preset "${name}". Available presets: ${describePresets(presets)}`,
    );
  }

  applied.add(name);

  return flattenExtends({
    applied,
    config: preset,
    presets,
    trail: [...trail, name],
  });
};

/**
 * Merge one transform entry over another of the same name.
 *
 * @returns the combined entry, keeping the base's name.
 */
const mergeTransformEntry = ({
  base,
  override,
}: {
  /** The inherited entry. */
  base: TransformEntry;

  /** The entry overriding it. */
  override: TransformEntry;
}): TransformEntry => ({
  enabled: override.enabled ?? base.enabled,
  name: base.name,
  options: { ...base.options, ...override.options },
});

/**
 * Merge an overriding transform list onto an inherited one.
 *
 * @returns the combined list: overridden entries in place, new ones appended.
 */
const mergeTransformEntries = ({
  base,
  override,
}: {
  /** The inherited entries, in their inherited order. */
  base: readonly TransformEntry[];

  /** The overriding entries, in declaration order. */
  override: readonly TransformEntry[];
}): TransformEntry[] => {
  const duplicate = findDuplicateEntry(override);

  /*
   * A name repeated inside one list is refused rather than collapsed, matching
   * how the registry refuses two transforms answering to one name.
   *
   * - Merging them silently loses a step, and a second entry carrying
   *   `enabled: false` would switch off the first — so asking to run a
   *   transform twice produced an empty pipeline instead of a doubled one.
   *
   * - Running a transform twice is a reasonable thing to want, and it stays
   *   available: it needs a way to address one occurrence rather than the
   *   name, which is a feature rather than a merge rule.
   */
  if (duplicate !== undefined) {
    throw new ConfigError(
      `transform "${duplicate.name}" is listed twice in one configuration, ` +
        `at entries ${duplicate.first} and ${duplicate.second}`,
    );
  }

  return override.reduce<TransformEntry[]>(
    (entries, entry) => {
      const index = entries.findIndex(
        (existing) => existing.name === entry.name,
      );

      if (index === -1) {
        return [...entries, entry];
      }

      /*
       * `Array.prototype.with` returns a copy of the array with one element
       * replaced — the non-mutating counterpart of `entries[index] = …`.
       *
       * - Pushing into `entries` instead would be safe, since the accumulator
       *   starts as a copy of `base` and no caller can observe it. It is
       *   avoided because it would leave the two branches inconsistent, one
       *   mutating and one returning a new array, which is the shape that
       *   later invites a real aliasing bug.
       *
       * - The allocation is not worth optimizing away: a pipeline is a handful
       *   of transforms, and both branches allocate either way.
       */
      return entries.with(
        index,
        mergeTransformEntry({ base: entries[index], override: entry }),
      );
    },
    [...base],
  );
};

/**
 * Resolve a config and its presets into a runnable pipeline.
 *
 * - Every field of the result is populated, so nothing downstream re-applies a
 *   default.
 *
 * @returns the resolved configuration.
 * @throws ConfigError on an unknown preset or an `extends` cycle.
 * @example resolveConfig({ config: { extends: ["preserve"] } }).printWidth // 80
 */
export const resolveConfig = ({
  config,
  presets = BUILT_IN_PRESETS,
}: {
  /**
   * The configuration as written.
   *
   * @example { extends: ["bullets"], printWidth: 100 }
   */
  config: Config;

  /**
   * Every preset available to `extends`.
   *
   * - Defaults to the built-ins; a config file's own presets are merged in by
   *   the adapter that read them, which is why this is a parameter at all.
   */
  presets?: PresetTable;
}): ResolvedConfig => {
  const layers = flattenExtends({
    applied: new Set<string>(),
    config,
    presets,
    trail: [],
  });

  const merged = layers.reduce<MergedConfig>(
    (accumulator, layer) => ({
      printWidth: layer.printWidth ?? accumulator.printWidth,
      transforms: mergeTransformEntries({
        base: accumulator.transforms,
        override: layer.transforms ?? [],
      }),
    }),
    { transforms: [] },
  );

  const resolved: ResolvedConfig = {
    printWidth: merged.printWidth ?? DEFAULT_PRINT_WIDTH,
    transforms: merged.transforms
      .filter((entry) => entry.enabled !== false)
      .map((entry): ResolvedTransformEntry => ({
        name: entry.name,

        /*
         * Copied, not passed through. An entry no override touched is still
         * the preset table's own object, so returning its `options` by
         * reference would share mutable state with `BUILT_IN_PRESETS` for the
         * life of the process.
         */
        options: { ...entry.options },
      })),
  };

  logger.debug(
    {
      printWidth: resolved.printWidth,
      transforms: resolved.transforms.map((entry) => entry.name),
    },
    "resolved configuration",
  );

  return resolved;
};
