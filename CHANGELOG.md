# Changelog

## Unreleased

- Added a small-organization SQLite edition with WAL, foreign keys, FTS5 search, bounded lock waits, versioned migrations, legacy import, and consistent backup/validated restore commands.
- Added bcrypt web login, revocable HttpOnly cookie sessions, CSRF protection, rate limiting, account status, extension-specific rotating credentials, and security audit logs.
- Added workspaces, owner/admin/member/viewer policy enforcement, member administration, and cross-workspace negative integration coverage.
- Moved Ollama analysis to a durable SQLite worker queue with short serialized claims, bounded concurrency, timeout/retry/failure states, stale-job recovery, prompt isolation, and schema-validated output.
- Rebuilt the MV3 extension around deployment-specific HTTPS permissions, server settings/login/logout, persistent capture/upload state, stable idempotency, and exponential/manual retry.
- Added authenticated dashboard flows, workspace switching, server-backed search, role-aware actions, account/session settings, dependency health, and responsive accessibility improvements.
- Added non-root multi-stage containers, Caddy HTTPS, a shared local SQLite volume, internal Ollama networking, fail-fast server configuration, structured/redacted logs, health/readiness, and graceful shutdown.
- Added production deployment, architecture, operations, backup/restore, extension distribution, privacy, security, and threat-model documentation while preserving the existing source-available license and attribution.

## 0.1.0 - Initial derivative

- Reimplemented Google Meet caption capture as a small Manifest V3 companion extension.
- Added a local Express API and JSON-file meeting store.
- Added deterministic speaker participation statistics using caption duration, with spoken-unit fallback.
- Added a Thai React dashboard for summaries, speaker ranking, topic ownership, and transcript filtering.
- Added local Ollama integration with structured JSON output for summaries, decisions, actions, and topics.
- Added responsive desktop and mobile layouts.
- Added explicit attribution and preserved the original license terms.
- Added production configuration validation, security headers, CORS restrictions, rate limits, bounded import schemas, and serialized local writes.
- Added cross-platform setup and Chrome extension packaging commands.
- Added Docker support, CI, CodeQL, Dependabot, automated releases, and repository community templates.
- Added contribution, security, privacy, support, and release documentation.
