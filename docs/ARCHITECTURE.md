# Architecture

## Runtime boundaries

The Chrome extension is an untrusted remote client. Caddy terminates TLS and forwards requests to one stateless API process. Web and extension sessions are persisted in PostgreSQL, so API replicas do not share mutable process state. A separate worker claims analysis jobs using `FOR UPDATE SKIP LOCKED` and sends bounded requests to the configured Ollama origin.

```text
Google Meet DOM
  -> MV3 content script
  -> persistent chrome.storage.local upload queue
  -> HTTPS /api/v1/meetings/ingest
  -> authentication + membership policy + Zod validation
  -> PostgreSQL transaction (meeting, segments, idempotency result)
  -> dashboard

POST /api/v1/meetings/:id/analyze
  -> analysis row + PostgreSQL job
  -> worker claim
  -> server-configured Ollama
  -> schema-validated JSON
  -> completed/failed analysis state
```

## Source layout

- `src/`: React dashboard, route guard state, accessible transcript/search/member administration.
- `server/routes/`: versioned HTTP boundaries only.
- `server/auth/`: password, opaque cookie session, extension token, CSRF, and policy middleware.
- `server/services/`: tenant-scoped business operations, audit records, statistics, and jobs.
- `server/integrations/`: Ollama protocol boundary and response validation.
- `server/db/`: Drizzle schema, pool, and versioned SQL migration runner.
- `packages/shared/`: roles, permissions, Zod request/response contracts, and stable error types.
- `extension/`: MV3 capture, session settings, persistent retry queue, and build-time origin manifest.

## Data model

`users` have a status and bcrypt password hash. `workspaces` and `workspace_members` model many-to-many membership and role. `meetings.workspace_id` is mandatory. Segments cascade with the meeting. One current `analysis` belongs to each meeting; normalized `decisions` and `action_items` are retained for future workflow use while the validated complete result is stored as JSONB. Web and extension sessions are distinct tables. `ingestion_keys` bind idempotency to an extension session and request hash. `analysis_jobs` is the durable queue. `audit_logs` contains opaque identifiers and metadata but not transcripts or secrets.

Foreign keys and explicit cascade/restrict rules are in `migrations/0001_initial.sql`. Public identifiers are UUIDs. Meeting deletion is a deliberate soft delete to support operator recovery; related rows remain until retention/manual purge is implemented.

## Authorization invariant

The client-selected workspace is never trusted by itself. Web API middleware verifies membership and permission. Extension workspace comes from the validated session, not the payload. Meeting repositories include both `meeting.id` and `meeting.workspace_id` in reads, updates, deletes, and analysis enqueue operations. A known meeting UUID therefore does not cross the tenant boundary.

## Deployment modes

`DEPLOYMENT_MODE=local` permits localhost HTTP and development secrets. `DEPLOYMENT_MODE=server` requires production mode, HTTPS public origin, non-loopback binding, explicit CORS origins, strong unique secrets, and constrained proxy trust. PostgreSQL remains the primary store in both modes; there is no JSON-store production path.
