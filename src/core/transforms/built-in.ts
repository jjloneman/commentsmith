import type { TransformDefinition } from "#core/config/types";

import { bulletize } from "#core/transforms/bulletize";
import { rewrap } from "#core/transforms/rewrap";

/**
 * The transforms Commentsmith ships with.
 *
 * - The list lives here rather than beside `createTransformRegistry` because
 *   the registry is machinery and this is content. Keeping it in
 *   `config/registry.ts` would make that module import each transform, while
 *   every transform imports `defineTransform` back from it — a cycle whose
 *   first symptom is a transform's top-level `defineTransform` call reaching
 *   the function in its temporal dead zone.
 *
 * - It is a plain list, not a barrel: nothing is re-exported through it, and a
 *   caller wanting one transform imports that transform.
 */
export const BUILT_IN_TRANSFORMS: readonly TransformDefinition[] = [
  bulletize,
  rewrap,
];
