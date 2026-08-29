# 🧪 Cross-cutting test support

Per-module tests are **co-located** as a sibling `*.test.ts` next to the file
under test — they do not live here.

This directory is for support shared across modules, imported via the `#test/*`
subpath alias:

- `helpers/` — factories and harnesses (e.g. `createMock*` doubles).
- `fixtures/` — the golden comment corpus, one canonical comment per `.txt`
  file. [round-trip.test.ts](round-trip.test.ts) asserts
  `renderComment(parseComment(x)) === x` across every one of them, in both LF
  and CRLF, so adding a fixture needs no test edit — and a corpus that silently
  matched nothing would fail its own emptiness guard.
