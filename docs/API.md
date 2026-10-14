# snape-docs API: for scripts and AI agents

Everything the web editor does goes through this HTTP API, so anything a person can do in the editor can be done by a script or an agent.
Locally it is at `http://localhost:8787` (start it with `npm run dev`). There is no login locally; deployed behind Cloudflare Access, send a
service token (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers, or `SNAPE_CF_ID` / `SNAPE_CF_SECRET` for the command line).

| What | Where |
| --- | --- |
| **Machine-readable description** (OpenAPI 3.1, includes the document schema) | `GET /api/openapi.json` |
| JSON Schema of a document's `data` | `GET /api/doctypes/offer/schema` |
| A complete new document to start from | `GET /api/doctypes/offer/example?lang=de` |
| Dry-run check ("would this be accepted?") | `POST /api/doctypes/offer/validate` with `{"data": …}` |
| Command line for all of it | `npm run snape -- <command>` (no arguments = list of commands) |
| Tests that exercise it against a running app | `npm run test:api` |

An agent should start with `GET /api/openapi.json`, then `GET /api/doctypes/offer/schema` and `…/example`.

## Concepts

- A **document** has `id`, `number` (ANG-2026-006), `type` (`offer`), `lang` (`de`|`en`), `status` (`draft`|`sent`|`accepted`|`declined`), `title`, a client, the **Objekt lines** (`artwork`: `[{k, v}]`) and `data` (the content, below).
- `data.blocks` is the ordered content: `prose`, `note`, `measures` (treatment table), `objects` (object list for collections), `pagebreak`. Every block, row and photo has a stable `id` (generated if you leave it out); use it to address items (`@id`, below).
- **Never write calculated numbers.** Hour totals, CHF amounts and the cost paragraph are calculated from the tables when the document is rendered. Only `hoursMin`/`hoursMax` per row and `rate` are inputs.
- **Photos** are uploaded first (`POST /api/images`, raw JPEG/PNG bytes, resize to about 1600 px before), then referenced by `imageId`.
- `privateNotes` (small HTML) is the owner's private notes. It is never printed or exported.
- **Revisions:** every document has `rev`, which goes up by one on every save. Send the `rev` you read as `baseRev` in the body (or `If-Match: <rev>`); if someone else saved in between you get **409** instead of overwriting their work. The editor does this too, so an agent and a person can work on the same offer without clobbering each other.
- Every save is validated against the schema (envelope: [src/core/envelope.ts](../src/core/envelope.ts), data: `GET /api/doctypes/offer/schema`; versioning rules in [SCHEMA.md](SCHEMA.md)). Documents carry `schemaVersion`; data you send is upgraded to it, data newer than the app is refused. Unknown top-level fields are refused (a typo cannot silently do nothing). A history version can be restored only if it validates: `GET …/versions/:vid` says (`restorable`, `issues`).
- Errors are always JSON: `{"error", "code", "issues":[{"path","message"}]}` with codes `validation` (422), `conflict` (409), `patch_failed` (400, with `opIndex`), `bad_request`, `bad_json`, `not_found`, `in_use`, `not_restorable` (422).

## Typical flows

```bash
# 1. look around
npm run snape -- list
npm run snape -- get 22                      # includes rev, data, client, artwork

# 2. create an offer with content in one call (data may be partial; meta/cost are merged into the defaults)
npm run snape -- create offer.json --lang de --client 1

# 3. edit it: JSON Patch (RFC 6902) with "@id" paths; all operations or none
npm run snape -- patch 22 ops.json --rev 3

# 4. check, see, export
npm run snape -- validate data.json
npm run snape -- pdf 22 offer.pdf            # A4 PDF via headless Chrome (app must be running; Chrome installed)
npm run snape -- html 22 offer.html          # the document as script-free HTML
```

`offer.json` (everything but `type` is optional):

```json
{
  "type": "offer", "lang": "de", "title": "Kopie nach Beispiel", "clientId": 1,
  "artwork": [{ "k": "Titel", "v": "Beispiel" }, { "k": "Technik / Material", "v": "Öl auf Leinwand" }],
  "data": {
    "meta": { "date": "2026-10-14" },
    "rate": 100,
    "blocks": [
      { "type": "prose", "headingKey": "condition", "paragraphs": ["Der Firnis ist vergilbt."] },
      { "type": "measures", "kind": "main", "rows": [
        { "title": "Oberflächenreinigung", "desc": "Trockenreinigung, dann …", "hoursMin": 2, "hoursMax": 3 } ] }
    ]
  }
}
```

`ops.json` (the document view you patch is `{title, status, lang, clientId, artwork, data}`):

```json
[
  { "op": "replace", "path": "/data/blocks/@c4f75ceb/rows/0/hoursMin", "value": 3 },
  { "op": "add",     "path": "/data/blocks/@c4f75ceb/rows/-", "value": { "title": "Retusche", "desc": "", "hoursMin": 1 } },
  { "op": "add",     "path": "/data/privateNotes", "value": "<ul><li>Kunde zurückrufen</li></ul>" },
  { "op": "replace", "path": "/status", "value": "sent" }
]
```

Path rules: JSON Pointer; `-` appends to an array; `@<id>` selects the array item whose `id` is `<id>` (survives reordering); supported ops `add`, `replace` (on a missing object key it just sets it), `remove`, `move`, `copy`, `test`.

## Endpoints

Full detail, request and response shapes: `GET /api/openapi.json`. In short:

| | |
| --- | --- |
| `GET /api/documents[?type=]` · `POST /api/documents` | list · create (new, with content, or `{duplicateOf: id}`) |
| `GET/PUT/PATCH/DELETE /api/documents/:id` | read · replace parts · JSON Patch · delete (permanent: `npm run backup` first) |
| `GET /api/documents/:id/html` | the document as HTML |
| `GET /documents/:id/print` · `/documents/:id/standalone.html` | A4 print view (Save as PDF) · self-contained file |
| `GET/POST /api/documents/:id/versions` · `GET …/versions/:vid` · `POST …/versions/:vid/restore` | history |
| `GET/POST /api/clients` · `GET/PUT/DELETE /api/clients/:id` | clients (delete only when no document uses it) |
| `POST /api/images?documentId=&w=&h=` · `GET /api/images[?documentId=]` · `GET /api/images/:id` · `GET /img/:id` | photos |
| `GET/POST /api/snippets` · `GET/PUT /api/settings` | text snippet library · hourly rate, validity, language, place of signing |
| `GET /api/doctypes` · `…/:type/schema` · `…/:type/example` · `POST …/:type/validate` | self-description |

## Safety notes for agents

- Read before you write, and send `baseRev`. On `409`, read the document again and redo the change on top of it.
- `DELETE` is permanent. Run `npm run backup` first and only delete what was asked for.
- Photos, client data and the signature are private: keep exports and scratch files out of the git repository (`seed/` and `.wrangler/` are ignored).
- Do not edit `cost.overrideHtml` unless asked: its figures are not recalculated.
- Dates are ISO (`2026-10-14`). While an offer is a draft with `meta.dateAuto` the date follows today; marking it `sent` freezes it.
