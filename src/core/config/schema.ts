/**
 * The JSON Schema for a Commentsmith configuration.
 *
 * - It exists so the VS Code settings UI and a CLI rc file validate against the
 *   same description, rather than each editor inventing its own.
 *
 * - **The schema is hand-authored and kept in sync by the type system, not by a
 *   generator.** Each `properties` object is written
 *   `satisfies Record<keyof T, JsonSchemaNode>`, so a field added to the type
 *   without a schema entry — or a schema entry naming a field the type does not
 *   have — is a compile error. That buys the "one source of truth" guarantee
 *   with no dependency, no compiler API in the build, and no schema shaped by a
 *   generator's conventions instead of by what a settings UI renders well.
 *
 * - It is also the single source of the **key names** runtime validation
 *   accepts, which is why `validate.ts` reads them from here rather than
 *   repeating them.
 */

import type { Config, TransformEntry } from "#core/config/types";

import { DEFAULT_PRINT_WIDTH } from "#core/config/types";

/**
 * The subset of JSON Schema this configuration uses.
 *
 * - Deliberately not the whole specification. Modeling only what is used keeps
 *   the `satisfies` checks meaningful; a permissive `Record<string, unknown>`
 *   would accept a typo'd keyword silently.
 *
 * - Exported so anything walking the schema describes it with this type rather
 *   than re-declaring a lookalike, which would drift the moment a keyword is
 *   added here.
 */
export type JsonSchemaNode = {
  /**
   * The dialect, on the root node only.
   *
   * @example "http://json-schema.org/draft-07/schema#"
   */
  $schema?: string;

  /**
   * Whether properties beyond those declared are permitted.
   *
   * @example false
   */
  additionalProperties?: boolean;

  /**
   * The value used when the property is absent.
   *
   * @example 80
   */
  default?: unknown;

  /** Prose shown by an editor's completion and hover. */
  description: string;

  /** The schema every element of an array matches. */
  items?: JsonSchemaNode;

  /**
   * The smallest permitted numeric value.
   *
   * @example 1
   */
  minimum?: number;

  /**
   * The shortest permitted string.
   *
   * - Present wherever `validate.ts` rejects an empty string, so an editor
   *   flags the same value the runtime would throw on rather than
   *   green-lighting it.
   *
   * @example 1
   */
  minLength?: number;

  /** The declared properties of an object, keyed by name. */
  properties?: Record<string, JsonSchemaNode>;

  /**
   * The properties that must be present.
   *
   * @example ["name"]
   */
  required?: string[];

  /**
   * A human-readable name, on the root node only.
   *
   * @example "Commentsmith configuration"
   */
  title?: string;

  /**
   * The JSON type this node describes.
   *
   * @example "object"
   */
  type: "array" | "boolean" | "integer" | "number" | "object" | "string";
};

/**
 * One transform entry's properties.
 *
 * - The `satisfies` is the sync guarantee: every key of `TransformEntry` must
 *   appear here, and nothing else may.
 */
const TRANSFORM_ENTRY_PROPERTIES = {
  enabled: {
    default: true,
    description:
      "Whether to run this transform. Set to false to suppress an entry " +
      "inherited from a preset without restating the rest of its pipeline.",
    type: "boolean",
  },
  name: {
    description: "The registered transform's name, such as body/rewrap.",
    minLength: 1,
    type: "string",
  },
  options: {
    additionalProperties: true,
    description:
      "Options merged over the transform's own defaults. The merge is " +
      "shallow, so a nested value is replaced rather than combined.",
    type: "object",
  },
} satisfies Record<keyof TransformEntry, JsonSchemaNode>;

/** One entry of the ordered transform list. */
export const TRANSFORM_ENTRY_SCHEMA = {
  additionalProperties: false,
  description: "A transform to run, and the options to run it with.",
  properties: TRANSFORM_ENTRY_PROPERTIES,
  required: ["name"],
  type: "object",
} satisfies JsonSchemaNode;

/**
 * The configuration's own properties.
 *
 * - Same `satisfies` guarantee as above, against `Config`.
 */
const CONFIG_PROPERTIES = {
  extends: {
    description:
      "Preset names to inherit from, applied left to right so a later entry " +
      "wins.",
    items: {
      description: "A preset name, such as bullets.",
      minLength: 1,
      type: "string",
    },
    type: "array",
  },
  printWidth: {
    default: DEFAULT_PRINT_WIDTH,
    description: "The column comment body text is wrapped to.",
    minimum: 1,
    type: "integer",
  },
  transforms: {
    description:
      "The transforms to run, in the order they run in. Order is " +
      "significant: each transform sees what the previous one produced.",
    items: TRANSFORM_ENTRY_SCHEMA,
    type: "array",
  },
} satisfies Record<keyof Config, JsonSchemaNode>;

/** The complete configuration schema, as published for editors to consume. */
export const CONFIG_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  additionalProperties: false,
  description:
    "Configuration for Commentsmith, a configurable comment formatter.",
  properties: CONFIG_PROPERTIES,
  title: "Commentsmith configuration",
  type: "object",
} satisfies JsonSchemaNode;
