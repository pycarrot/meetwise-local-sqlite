# Security policy

## Reporting

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/pycarrot/meetwise-local-sqlite/security/advisories/new), not a public issue. Use synthetic data and include affected version, reproduction, impact, and mitigation. Never attach real transcripts, identities, credentials, browser profiles, database files, or organizational secrets.

## Security model

- Production requires HTTPS, strong independent secrets, a persistent local SQLite file, non-loopback binding, exact CORS origins, and constrained proxy trust.
- Caddy terminates TLS; Ollama and the API container port are not published. The SQLite volume stays local to one host and is never a network service.
- Passwords use bcrypt cost 12. Login errors are generic and rate limited by IP/account hash.
- Web sessions are opaque, server-stored, revocable, HttpOnly/Secure/SameSite in server mode, and protected by per-session CSRF validation.
- Extension access tokens are short-lived; refresh credentials are hashed, rotating, revocable, workspace-bound, and separate from web sessions.
- Central policies and tenant-scoped queries enforce owner/admin/member/viewer access. User/workspace identity always comes from authentication, not ingestion payloads.
- SQLite foreign keys, constraints, parameterized Drizzle queries, short write transactions, WAL, body limits, Zod validation, idempotency, rate limits, CSP, and secure headers reduce common risks.
- Structured logs redact authorization/cookies and exclude passwords, tokens, transcripts, prompts, database URLs, and secrets. Sensitive actions are audit logged with keyed IP hashes.
- Ollama origin/model are operator configuration, never request input. Requests have timeouts and size bounds; transcript is isolated as untrusted data and output is schema validated.

Do not treat proxy trust or CORS as authentication. Do not expose Ollama, the Docker API, SQLite volume, or unencrypted app port. Do not put the SQLite file on a network filesystem or mount it on multiple hosts.

## Secrets and at-rest protection

Use a secret manager, not committed `.env` files. Rotating `TOKEN_SIGNING_SECRET` invalidates access tokens; revoke extension sessions during rotation. Sessions can be revoked through user settings or incident procedures.

Meetwise does not implement application-layer encryption at rest. Use an encrypted host volume and encrypt backups separately. No claim of encryption is made by this project.

## Supported versions

Security fixes target the latest release and `main`. Keep Node.js, Caddy, Ollama, libSQL/SQLite dependencies, container runtime, base images, and npm dependencies patched. CI audits inform but do not replace review.
