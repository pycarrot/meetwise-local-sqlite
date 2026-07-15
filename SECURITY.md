# Security policy

## Reporting

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/pycarrot/meetwise-local/security/advisories/new), not a public issue. Use synthetic data and include affected version, reproduction, impact, and suggested mitigation. Never attach real transcripts, participant identities, passwords, session tokens, browser profiles, database dumps, or organizational secrets.

## Security model

- Production startup requires HTTPS public configuration, strong independent secrets, PostgreSQL, a non-loopback bind, exact CORS origins, and constrained reverse-proxy trust.
- Caddy terminates TLS; internal PostgreSQL/Ollama networks are not published. External database TLS is explicitly configurable and certificate verification defaults on.
- Passwords use bcrypt cost 12. Login errors are generic and login endpoints are rate-limited by IP/account hash.
- Web sessions are opaque, server-stored, revocable, rotated on login, HttpOnly/Secure/SameSite in server mode, and protected by per-session CSRF validation.
- Extension access tokens are short-lived and signed; extension refresh credentials are hashed at rest, rotating, revocable, workspace-bound, and distinct from web sessions.
- Central permission policy and tenant-scoped repository queries enforce owner/admin/member/viewer access. The server derives user/workspace from authentication, never ingestion payload fields.
- Helmet CSP/secure headers, strict JSON/body limits, Zod validation, parameterized Drizzle/pg queries, UUID identifiers, idempotency, and endpoint rate limits reduce common web/API risks.
- Structured logs redact authorization/cookies and never intentionally contain passwords, tokens, full transcripts, Ollama prompts, database URLs, or secrets. Security actions are audit logged with keyed IP hashes.
- Ollama origin is operator configuration, never request input. Requests have timeouts and bounded transcript size. Transcript is isolated as untrusted data from system instructions; output is JSON-schema validated before storage/rendering.

Do not treat `TRUST_PROXY`, CORS, or a reverse proxy as authentication. Do not expose PostgreSQL, Ollama, Docker API, or the API's unencrypted container port publicly.

## Secret rotation

Use a secret manager, not committed `.env` files. Rotating `TOKEN_SIGNING_SECRET` invalidates access tokens; revoke extension sessions during the rotation. Rotate database credentials atomically with `DATABASE_URL`. Session and token credentials can be revoked through user settings or directly in an incident. See `docs/OPERATIONS.md`.

## At-rest protection

Meetwise does not implement application-layer encryption at rest. Use encrypted disks/volumes or a PostgreSQL service with documented encryption, and encrypt backups separately. No claim of encryption is made by this project.

## Supported versions

Security fixes target the latest release and `main`. Operators must keep Node.js, PostgreSQL, Caddy, Ollama, container runtime, base images, and npm dependencies patched. CI audit results are advisory inputs, not a substitute for review.
