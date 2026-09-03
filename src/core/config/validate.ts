/**
 * Runtime validation — narrowing an untrusted value into a {@link Config}.
 *
 * - The JSON Schema is the **editor-facing** authority; this module is the
 *   **runtime** one. A generic validator driven by the schema object would be a
 *   small JSON Schema engine, which is real complexity for a handful of fields
 *   in a project whose premise is zero runtime dependencies.
 *
 * - The two cannot drift on key names, because the accepted keys are read out
 *   of the schema rather than repeated here — and the schema's keys are checked
 *   against the types by `tsc`.
 *
 * - Every diagnostic names the **path** it failed at. A config file is edited
 *   by hand, so "expected a positive integer" without a location is a message
 *   that makes the user search.
 */

import type {
  Config,
  TransformEntry,
  TransformOptions,
} from "#core/config/types";

import { ConfigError } from "#core/config/errors";
import {
  CONFIG_JSON_SCHEMA,
  TRANSFORM_ENTRY_SCHEMA,
} from "#core/config/schema";

/** The keys a configuration object may carry. */
const CONFIG_KEYS = Object.keys(CONFIG_JSON_SCHEMA.properties);

/** The keys one transform entry may carry. */
const TRANSFORM_ENTRY_KEYS = Object.keys(TRANSFORM_ENTRY_SCHEMA.properties);

/**
 * Name a value's type for a diagnostic.
 *
 * - A missing key reads as "nothing" rather than "undefined", because from the
 *   author's side the key simply is not there.
 *
 * @returns the type, phrased to follow the word "received".
 * @example describeType([]) // "an array"
 */
const describeType = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "nothing";
  }

  if (Array.isArray(value)) {
    return "an array";
  }

  return typeof value === "object" ? "an object" : `a ${typeof value}`;
};

/**
 * Whether a value is a non-null, non-array object.
 *
 * @returns `true` for a plain object.
 * @example isPlainObject([]) // false
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Narrow a value to a plain object, or fail with its path.
 *
 * @returns the value as a keyed object.
 * @throws ConfigError when it is not one.
 */
const readObject = ({
  path,
  value,
}: {
  /**
   * Where the value sits in the configuration.
   *
   * @example "config.transforms[0]"
   */
  path: string;

  /** The untrusted value. */
  value: unknown;
}): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new ConfigError(
      `${path}: expected an object, received ${describeType(value)}`,
    );
  }

  return value;
};

/**
 * Narrow a value to a list of preset names.
 *
 * @returns the names, in order.
 * @throws ConfigError when it is not an array of non-empty strings.
 */
const readPresetNames = ({
  path,
  value,
}: {
  /** Where the value sits in the configuration. */
  path: string;

  /** The untrusted value. */
  value: unknown;
}): string[] => {
  if (!Array.isArray(value)) {
    throw new ConfigError(
      `${path}: expected an array, received ${describeType(value)}`,
    );
  }

  return value.map((entry: unknown, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new ConfigError(
        `${path}[${index}]: expected a non-empty preset name, ` +
          `received ${describeType(entry)}`,
      );
    }

    return entry;
  });
};

/**
 * Narrow a value to a usable wrap column.
 *
 * @returns the column.
 * @throws ConfigError when it is not a positive integer.
 */
const readPrintWidth = ({
  path,
  value,
}: {
  /** Where the value sits in the configuration. */
  path: string;

  /** The untrusted value. */
  value: unknown;
}): number => {
  if (typeof value !== "number") {
    throw new ConfigError(
      `${path}: expected a number, received ${describeType(value)}`,
    );
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new ConfigError(
      `${path}: expected a positive integer, received ${value}`,
    );
  }

  return value;
};

/**
 * Narrow a value to one transform entry.
 *
 * @returns the entry.
 * @throws ConfigError when any field is missing or the wrong type.
 */
const readTransformEntry = ({
  path,
  value,
}: {
  /** Where the value sits in the configuration. */
  path: string;

  /** The untrusted value. */
  value: unknown;
}): TransformEntry => {
  const entry = readObject({ path, value });

  rejectUnknownKeys({ known: TRANSFORM_ENTRY_KEYS, path, value: entry });

  if (typeof entry.name !== "string" || entry.name.length === 0) {
    throw new ConfigError(
      `${path}.name: expected a non-empty transform name, ` +
        `received ${describeType(entry.name)}`,
    );
  }

  if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
    throw new ConfigError(
      `${path}.enabled: expected a boolean, ` +
        `received ${describeType(entry.enabled)}`,
    );
  }

  return {
    enabled: entry.enabled,
    name: entry.name,
    options:
      entry.options === undefined
        ? undefined
        : (readObject({
            path: `${path}.options`,
            value: entry.options,
          }) satisfies TransformOptions),
  };
};

/**
 * Narrow a value to an ordered transform list.
 *
 * @returns the entries, in order.
 * @throws ConfigError when it is not an array of valid entries.
 */
const readTransformEntries = ({
  path,
  value,
}: {
  /** Where the value sits in the configuration. */
  path: string;

  /** The untrusted value. */
  value: unknown;
}): TransformEntry[] => {
  if (!Array.isArray(value)) {
    throw new ConfigError(
      `${path}: expected an array, received ${describeType(value)}`,
    );
  }

  return value.map((entry: unknown, index) =>
    readTransformEntry({ path: `${path}[${index}]`, value: entry }),
  );
};

/**
 * Fail on any key the schema does not declare.
 *
 * - Rejecting rather than ignoring is what turns a typo into a message. A
 *   silently ignored `printwidth` looks exactly like a setting that had no
 *   effect.
 *
 * @throws ConfigError listing the offending keys and the accepted ones.
 */
const rejectUnknownKeys = ({
  known,
  path,
  value,
}: {
  /**
   * The keys the schema declares.
   *
   * @example ["extends", "printWidth", "transforms"]
   */
  known: readonly string[];

  /** Where the object sits in the configuration. */
  path: string;

  /** The object whose keys are being checked. */
  value: Record<string, unknown>;
}): void => {
  const unexpected = Object.keys(value)
    .filter((key) => !known.includes(key))
    .sort();

  if (unexpected.length > 0) {
    throw new ConfigError(
      `${path}: unknown ${unexpected.length === 1 ? "key" : "keys"} ` +
        `${unexpected.map((key) => `"${key}"`).join(", ")}. ` +
        `Known keys: ${[...known].sort().join(", ")}`,
    );
  }
};

/**
 * Validate an untrusted value as a configuration.
 *
 * - Absent fields stay absent rather than being defaulted here. Defaulting is
 *   {@link resolveConfig}'s job, and doing it in both places is how the two
 *   drift.
 *
 * @returns the value, typed.
 * @throws ConfigError naming the path and the expectation that failed.
 * @example parseConfig({ printWidth: 100 }).printWidth // 100
 */
export const parseConfig = (
  /**
   * The parsed contents of a config file, or a settings object.
   *
   * @example { extends: ["bullets"], printWidth: 100 }
   */
  value: unknown,
): Config => {
  const config = readObject({ path: "config", value });

  rejectUnknownKeys({ known: CONFIG_KEYS, path: "config", value: config });

  return {
    extends:
      config.extends === undefined
        ? undefined
        : readPresetNames({ path: "config.extends", value: config.extends }),
    printWidth:
      config.printWidth === undefined
        ? undefined
        : readPrintWidth({
            path: "config.printWidth",
            value: config.printWidth,
          }),
    transforms:
      config.transforms === undefined
        ? undefined
        : readTransformEntries({
            path: "config.transforms",
            value: config.transforms,
          }),
  };
};
