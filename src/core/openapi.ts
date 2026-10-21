import { z } from 'zod';
import { docTypes } from './registry';
import { artworkLine, documentCreate, documentRead, documentWrite } from './envelope';

/** The OpenAPI description of the HTTP API (GET /api/openapi.json). Document `data` schemas come from the document types themselves. */
export function openapi(origin: string) {
  const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
  const json = (schema: unknown, description = 'OK') => ({ description, content: { 'application/json': { schema } } });
  const err = (description: string) => json(ref('Error'), description);
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
  const rev = { name: 'If-Match', in: 'header', required: false, description: 'Revision you last read (the `rev` field). The save is refused with 409 if the document changed since. Same as `baseRev` in the body.', schema: { type: 'integer' } };

  const gen = (schema: z.ZodType, io: 'input' | 'output' = 'input') => { const j: any = z.toJSONSchema(schema, { target: 'draft-2020-12', io }); delete j.$schema; return j; };
  const offer = docTypes.offer;
  const dataSchemas: Record<string, unknown> = {};
  for (const t of Object.values(docTypes)) if (t.schema) dataSchemas[`${t.id}Data`] = z.toJSONSchema(t.schema, { target: 'draft-2020-12', io: 'input' });

  return {
    openapi: '3.1.0',
    info: {
      title: 'snape-docs API', version: '1.0.0',
      description: 'Create, read, edit and export Snape Art Conservation documents (offers now; invoices and reports later). Everything the web editor does goes through this API. '
        + 'No authentication locally; when deployed it sits behind Cloudflare Access (use a service token). Read `GET /api/doctypes/{type}/schema` for the exact shape of a document\'s `data` and `/example` for a complete sample. See docs/API.md.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/health': { get: { summary: 'Is the server up?', operationId: 'health', responses: { 200: json({ type: 'object' }) } } },
      '/api/doctypes': { get: { summary: 'Document types, their statuses and labels', operationId: 'listDocTypes', responses: { 200: json({ type: 'array', items: ref('DocType') }) } } },
      '/api/doctypes/{type}/schema': { get: { summary: 'JSON Schema of the document type\'s `data`', operationId: 'getDocTypeSchema', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: json({ type: 'object' }), 404: err('unknown type') } } },
      '/api/doctypes/{type}/example': { get: { summary: 'A complete new document of this type (what POST /api/documents starts from)', operationId: 'getDocTypeExample', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }, { name: 'lang', in: 'query', schema: { enum: ['de', 'en'] } }], responses: { 200: json(ref('NewDocument')), 404: err('unknown type') } } },
      '/api/doctypes/{type}/validate': { post: { summary: 'Dry run: would this `data` be accepted? Nothing is saved', operationId: 'validateData', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { data: {} } } } } }, responses: { 200: json({ type: 'object', properties: { valid: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object' } } } }) } } },
      '/api/documents': {
        get: { summary: 'List documents (newest edit first)', operationId: 'listDocuments', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }], responses: { 200: json({ type: 'array', items: ref('DocumentSummary') }) } },
        post: {
          summary: 'Create a document: new (optionally with content in one call) or a copy (`duplicateOf`)', operationId: 'createDocument',
          description: 'Statuses belong to revisions: draft → sent (freezes a permanent revision) → accepted | declined | withdrawn. Editing a sent offer starts the next revision; an accepted offer is locked (409 locked) until /amend. Only `type` is needed. `data` may be partial: its top-level keys replace the defaults, `meta` and `cost` are merged. Missing block/row ids are generated.',
          requestBody: { required: true, content: { 'application/json': { schema: ref('NewDocument') } } },
          responses: { 201: json({ type: 'object', properties: { id: { type: 'integer' }, number: { type: 'string' }, rev: { type: 'integer' } } }, 'created'), 400: err('bad request'), 422: err('data failed validation (see issues)') },
        },
      },
      '/api/documents/{id}': {
        parameters: [idParam],
        get: { summary: 'Read one document with its client and Objekt lines', operationId: 'getDocument', responses: { 200: json(ref('Document')), 404: err('not found') } },
        put: { summary: 'Replace parts of a document (any subset of title, status, lang, clientId, artwork, data)', operationId: 'putDocument', parameters: [rev], requestBody: { required: true, content: { 'application/json': { schema: ref('DocumentWrite') } } }, responses: { 200: json(ref('Saved')), 404: err('not found'), 409: err('changed since you read it'), 422: err('validation failed') } },
        patch: {
          summary: 'Edit with JSON Patch (RFC 6902) on {title,status,lang,clientId,artwork,data}', operationId: 'patchDocument', parameters: [rev],
          description: 'Body: an array of operations, or {"ops": [...], "baseRev": n}. A path segment `@<id>` addresses the array item with that id, `-` appends. Example: `[{"op":"replace","path":"/data/blocks/@c4f75ceb/rows/0/hoursMin","value":3}]`. All operations are applied or none.',
          requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [{ type: 'array', items: ref('PatchOp') }, { type: 'object', properties: { ops: { type: 'array', items: ref('PatchOp') }, baseRev: { type: 'integer' } }, required: ['ops'] }] } } } },
          responses: { 200: json(ref('Saved')), 400: err('the patch could not be applied (opIndex says which operation)'), 404: err('not found'), 409: err('changed since you read it'), 422: err('result failed validation') },
        },
        delete: { summary: 'Delete a document and its history (cannot be undone: back up first)', operationId: 'deleteDocument', responses: { 200: json({ type: 'object' }), 404: err('not found') } },
      },
      '/api/documents/{id}/html': { parameters: [idParam], get: { summary: 'The document as script-free HTML (house design, absolute image URLs)', operationId: 'getDocumentHtml', responses: { 200: { description: 'HTML', content: { 'text/html': { schema: { type: 'string' } } } } } } },
      '/api/documents/{id}/proofread': { parameters: [idParam], post: {
        summary: 'Proofread the wording with Claude: returns suggestions, changes nothing', operationId: 'proofreadDocument',
        description: 'Uses an Anthropic API key on the server, or (Settings, default when no key is set) the local helper that runs Claude Code with the owner\'s own login: 503 `bridge_down` / `not_logged_in` / `not_configured` say what is missing. Sends only the printed wording, never client data, prices or private notes. Each suggestion has a `path` you can use in a PATCH `replace` operation (check `before` still matches first). Suggestions that would change numbers or HTML tags are dropped (`skipped`). House rules come from Settings (`proofreadRules`).',
        responses: { 200: json({ type: 'object', properties: { suggestions: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, label: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' }, category: { enum: ['spelling', 'grammar', 'punctuation', 'terminology', 'style'] }, reason: { type: 'string' }, html: { type: 'boolean' } } } }, checked: { type: 'integer' }, skipped: { type: 'integer' }, model: { type: 'string' }, usage: { type: 'object' }, rev: { type: 'integer' } } }), 404: err('not found'), 429: err('rate limited by Anthropic'), 502: err('Anthropic error, bad key or declined'), 503: err('no API key configured') } } },
      '/api/proofread/status': { get: { summary: 'Is proofreading set up (an API key is present)? The key is never returned', operationId: 'proofreadStatus', responses: { 200: json({ type: 'object', properties: { configured: { type: 'boolean' }, model: { type: 'string' } } }) } } },
      '/documents/{id}/print': { parameters: [idParam], get: { summary: 'Print view laid out into A4 pages; open in a browser and "Save as PDF" (scripts/snape.mjs pdf does this headlessly)', operationId: 'printView', responses: { 200: { description: 'HTML page' } } } },
      '/documents/{id}/standalone.html': { parameters: [idParam], get: { summary: 'One self-contained HTML file (fonts, images, layout engine inlined)', operationId: 'standaloneHtml', responses: { 200: { description: 'HTML file' } } } },
      '/api/documents/{id}/amend': { parameters: [idParam], post: { summary: 'Start the next revision of a sent, declined, withdrawn or accepted offer (the only way to change an accepted offer)', operationId: 'amendDocument', responses: { 201: json({ type: 'object' }), 404: err('not found'), 422: err('it is already a draft') } } },
      '/api/documents/{id}/revisions': { parameters: [idParam],
        get: { summary: 'Every revision that was sent: sent date, note, status (sent / accepted / declined / withdrawn / superseded), the answer and headline figures', operationId: 'listRevisions', responses: { 200: json({ type: 'object' }) } },
        post: { summary: 'Mark the current revision as sent (same as PUT status "sent"). `fromVersion` freezes a history version instead: for an offer sent before revisions existed', operationId: 'sendRevision', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { sentAt: { type: 'string', format: 'date' }, note: { type: 'string' }, fromVersion: { type: 'integer' } } } } } }, responses: { 201: json({ type: 'object' }), 422: err('invalid or already sent') } } },
      '/api/documents/{id}/revisions/{n}': { parameters: [idParam, { name: 'n', in: 'path', required: true, schema: { type: 'integer' } }],
        get: { summary: 'One revision with its frozen content (exactly what was sent)', operationId: 'getRevision', responses: { 200: json({ type: 'object' }), 404: err('never sent') } },
        patch: { summary: 'Correct the dates and notes of a revision: {sentAt, note, decidedAt, decidedNote}', operationId: 'editRevision', responses: { 200: json({ type: 'object' }), 422: err('invalid') } },
        delete: { summary: 'Take back the latest sent record (marked as sent by mistake), only while no answer is recorded', operationId: 'takeBackRevision', responses: { 200: json({ type: 'object' }), 422: err('not allowed') } } },
      '/api/documents/{id}/revisions/{n}/html': { parameters: [idParam, { name: 'n', in: 'path', required: true, schema: { type: 'integer' } }], get: { summary: 'The revision exactly as it was sent, as HTML', operationId: 'getRevisionHtml', responses: { 200: { description: 'HTML' } } } },
      '/documents/{id}/revisions/{n}/print': { parameters: [idParam, { name: 'n', in: 'path', required: true, schema: { type: 'integer' } }], get: { summary: 'A sent revision as it was sent: print view (Save as PDF)', operationId: 'printRevision', responses: { 200: { description: 'HTML page' } } } },
      '/api/documents/{id}/revisions/{n}/decision': { parameters: [idParam, { name: 'n', in: 'path', required: true, schema: { type: 'integer' } }],
        post: { summary: 'Record the answer to a sent revision: {status: accepted | declined | withdrawn, at, note}', operationId: 'decideRevision', responses: { 200: json({ type: 'object' }), 422: err('not allowed') } },
        delete: { summary: 'Undo the recorded answer', operationId: 'undoDecision', responses: { 200: json({ type: 'object' }) } } },
      '/api/documents/{id}/versions': {
        parameters: [idParam],
        get: { summary: 'History of a document', operationId: 'listVersions', responses: { 200: json({ type: 'array', items: { type: 'object' } }) } },
        post: { summary: 'Save a named version of the current state', operationId: 'saveVersion', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string' } } } } } }, responses: { 201: json({ type: 'object' }) } },
      },
      '/api/documents/{id}/versions/{vid}': { parameters: [idParam, { name: 'vid', in: 'path', required: true, schema: { type: 'integer' } }], get: { summary: 'One version\'s full snapshot', operationId: 'getVersion', responses: { 200: json({ type: 'object' }), 404: err('not found') } } },
      '/api/documents/{id}/versions/{vid}/restore': { parameters: [idParam, { name: 'vid', in: 'path', required: true, schema: { type: 'integer' } }], post: { summary: 'Restore a version (the current state is saved as a version first)', operationId: 'restoreVersion', responses: { 200: json({ type: 'object' }), 404: err('not found') } } },
      '/api/clients': {
        get: { summary: 'List clients', operationId: 'listClients', responses: { 200: json({ type: 'array', items: ref('Client') }) } },
        post: { summary: 'Create a client', operationId: 'createClient', requestBody: { required: true, content: { 'application/json': { schema: ref('Client') } } }, responses: { 201: json({ type: 'object', properties: { id: { type: 'integer' } } }), 400: err('name required') } },
      },
      '/api/clients/{id}': {
        parameters: [idParam],
        get: { summary: 'Read a client', operationId: 'getClient', responses: { 200: json(ref('Client')), 404: err('not found') } },
        put: { summary: 'Replace a client', operationId: 'putClient', requestBody: { required: true, content: { 'application/json': { schema: ref('Client') } } }, responses: { 200: json({ type: 'object' }) } },
        delete: { summary: 'Delete a client no document uses', operationId: 'deleteClient', responses: { 200: json({ type: 'object' }), 409: err('still in use') } },
      },
      '/api/images': {
        get: { summary: 'List images (of one document with ?documentId=)', operationId: 'listImages', parameters: [{ name: 'documentId', in: 'query', schema: { type: 'integer' } }], responses: { 200: json({ type: 'array', items: { type: 'object' } }) } },
        post: {
          summary: 'Upload one JPEG or PNG (raw bytes as the body, Content-Type image/jpeg or image/png, at most 6 MB)', operationId: 'uploadImage',
          description: 'Resize first (about 1600 px longest edge; printed photos need far less). Pass `w` and `h` if you know them. Use the returned id as `imageId` in a document.',
          parameters: [{ name: 'documentId', in: 'query', schema: { type: 'integer' } }, { name: 'w', in: 'query', schema: { type: 'integer' } }, { name: 'h', in: 'query', schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } } } },
          responses: { 201: json({ type: 'object', properties: { id: { type: 'integer' } } }), 413: err('too large'), 415: err('not JPEG/PNG') },
        },
      },
      '/api/images/{id}': { parameters: [idParam], get: { summary: 'Image metadata (the bytes are at /img/{id})', operationId: 'getImage', responses: { 200: json({ type: 'object' }), 404: err('not found') } } },
      '/api/snippets': {
        get: { summary: 'Text snippet library (bilingual treatment rows, artist bios)', operationId: 'listSnippets', parameters: [{ name: 'kind', in: 'query', schema: { type: 'string' } }], responses: { 200: json({ type: 'array', items: { type: 'object' } }) } },
        post: { summary: 'Create or update a snippet by (kind, key); only the languages sent are overwritten', operationId: 'upsertSnippet', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['kind', 'key'] } } } }, responses: { 201: json({ type: 'object' }) } },
      },
      '/api/settings': { get: { summary: 'Hourly rate, validity days, default language, signature place', operationId: 'getSettings', responses: { 200: json({ type: 'object' }) } }, put: { summary: 'Change settings', operationId: 'putSettings', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: json({ type: 'object' }) } } },
    },
    components: {
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' }, code: { type: 'string', description: 'validation, conflict, not_found, patch_failed, bad_request, bad_json, internal' }, issues: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } }, opIndex: { type: 'integer' }, rev: { type: 'integer' } } },
        DocType: { type: 'object', properties: { id: { type: 'string' }, prefix: { type: 'string' }, labels: { type: 'object' }, statuses: { type: 'array', items: { type: 'string' } }, schemaVersion: { type: 'integer', description: 'current version of the document data; older data is upgraded on read' }, schemaChangelog: { type: 'array', items: { type: 'string' } } } },
        PatchOp: { type: 'object', required: ['op', 'path'], properties: { op: { enum: ['add', 'replace', 'remove', 'move', 'copy', 'test'] }, path: { type: 'string' }, from: { type: 'string' }, value: {} } },
        Saved: { type: 'object', properties: { ok: { type: 'boolean' }, rev: { type: 'integer', description: 'the new revision' }, updatedAt: { type: 'string' } } },
        Client: { type: 'object', required: ['name'], properties: { id: { type: 'integer' }, name: { type: 'string' }, address: { type: 'string' }, contact: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' } } },
        ArtworkLine: gen(artworkLine),
        NewDocument: gen(documentCreate(offer)),
        DocumentSummary: { type: 'object', properties: { id: { type: 'integer' }, type: { type: 'string' }, number: { type: 'string' }, lang: { enum: ['de', 'en'] }, status: { type: 'string' }, title: { type: ['string', 'null'] }, client: { type: ['string', 'null'] }, client_id: { type: ['integer', 'null'] }, updated_at: { type: 'string' }, rev: { type: 'integer' } } },
        Document: gen(documentRead(offer), 'output'),
        DocumentWrite: gen(documentWrite(offer)),
        ...dataSchemas,
      },
    },
  };
}
