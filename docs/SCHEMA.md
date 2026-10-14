# Document schema and versioning

One definition of what a document is, used by the editor, the HTTP API, scripts and agents. Every save is checked against it.

## The pieces

| | |
| --- | --- |
| **Envelope** (same for every document type) | `src/core/envelope.ts`: title, status, language, client, Objekt lines (`artwork`), `data`, `baseRev`. Strict: an unknown field (a typo such as `titel`) is refused. |
| **Type-specific data** (`data`) | `src/doctypes/offer/zod.ts`. The single definition: the TypeScript types are derived from it (`schema.ts` re-exports them) and it is published as JSON Schema. Unknown extra keys inside `data` are tolerated (older and newer data must not be rejected); everything declared is type-checked. |
| **Published** | `GET /api/doctypes` (version and changelog), `GET /api/doctypes/offer/schema` (JSON Schema, `x-schemaVersion`), `GET /api/openapi.json` (envelope + data), `GET /api/doctypes/offer/example` |
| **Version** | `data.v`, required. The current version of a type is `schemaVersion` on its `DocType` (offer: **2**). GET returns `schemaVersion` with every document. |
| **Migrations** | `src/doctypes/offer/migrations.ts`: one function per step (index *i* upgrades *i+1 → i+2*) and one changelog line per step. |
| **Frozen samples** | `tests/fixtures/<type>/v<N>.json`: what a document looked like at version N (invented content). |

## Rules

- **Reading** always upgrades old data to the current version (documents and history snapshots alike). Stored history is never rewritten.
- **Writing** upgrades what you send, fills in missing ids, then validates. Data **without** `v` is taken as the current version when creating a document. Data with a **newer** `v` than the app knows is refused (`data.v`: update the app).
- **Restoring** a history version upgrades it and validates it like a save. If it would not be a valid document, the restore is refused (`not_restorable`, with the paths) and the History panel shows why. `GET …/versions/:vid` reports `restorable` and `issues`.

## When to bump the version

| Change | Version bump? |
| --- | --- |
| Add an **optional** field or block type (old data stays valid) | No. Add it to `zod.ts` and to the newest fixture so the fixture stays complete. |
| Rename, move, restructure or remove a field; make a field required; change a type | **Yes.** |

To bump (`offer` as the example):

1. Change `zod.ts` (and the renderer) to the new shape.
2. Append a migration to `offerMigrations` and a line to `offerChangelog` (`migrations.ts`). It must be deterministic.
3. Raise `schemaVersion` in `offerType` (`render.ts`) and make `defaultData` produce the new shape.
4. Copy the newest fixture to `tests/fixtures/offer/v<N+1>.json` in the new shape. **Keep all older fixtures unchanged.**
5. `npm test`. `tests/unit/schema-versions.test.js` fails until all of this is in place; it checks that every frozen version still upgrades, validates and renders, and that the newest fixture uses every block type and top-level field.

Add a line to the table below.

## Versions

| Version | What changed |
| --- | --- |
| 1 | Original shape: blocks, rows and photos without ids. |
| 2 | Blocks, treatment rows and row photos have stable ids (history can tell "moved" from "edited"). Since then added without a bump, as optional fields: `meta.dateAuto`, `measures.option`/`common`, the `objects` block, `prose.bullets`, `cost.style`, `privateNotes`. |

## New document types

A new type (invoice, treatment report) brings its own `zod.ts`, `migrations.ts`, `schemaVersion` and fixtures folder, and registers its `schema`
on its `DocType`. The envelope, validation, API, OpenAPI, history and versioning tests apply to it automatically.
