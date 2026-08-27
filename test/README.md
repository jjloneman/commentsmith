# 🧪 Cross-cutting test support

Per-module tests are **co-located** as a sibling `*.test.ts` next to the file
under test — they do not live here.

This directory is for support shared across modules, imported via the `#test/*`
subpath alias:

- `helpers/` — factories and harnesses (e.g. `createMock*` doubles).
- `fixtures/` — golden before/after comment corpora, once the formatter lands.
