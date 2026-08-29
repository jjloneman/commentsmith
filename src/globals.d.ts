/**
 * The package version, inlined at bundle time by esbuild's `define`.
 *
 * - Declared rather than imported so neither bundle has to read package.json at
 *   runtime, which would break once the `.vsix` ships only `dist/`.
 */
declare const __VERSION__: string;
