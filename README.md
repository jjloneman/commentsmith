# 💬 comment-bulleter

A VS Code extension that reformats block and JSDoc comments into the
lead-sentence-then-bullets shape: the first paragraph stays prose, every
paragraph after it becomes one `-` bullet per sentence, bullets are separated by
a blank line, continuations hang-indent by two spaces, and everything rewraps to
80 columns.

## ✨ What it does

Turns this:

```ts
/**
 * Classify one message by sender and subject alone.
 *
 * Both a sender **and** a subject-shape match are required. Matching on subject
 * alone would let a forwarded copy trigger the pipeline.
 */
```

into this:

```ts
/**
 * Classify one message by sender and subject alone.
 *
 * - Both a sender **and** a subject-shape match are required.
 *
 * - Matching on subject alone would let a forwarded copy trigger the pipeline.
 */
```

## 🚧 Status

Early scaffold — the repo layout, toolchain, and extension entry point are being
set up. The formatter itself is not implemented yet.
