# Operations

## Health and logs

- `GET /api/v1/health` is process liveness and does not query dependencies.
- `GET /api/v1/ready` checks PostgreSQL, Ollama connectivity, and configured model availability. A failure returns 503 with per-dependency state.
- API logs are JSON and include request ID, method, route URL, status, and duration. Audit events are in PostgreSQL. Cookies, authorization headers, credentials, database URLs, prompts, and transcript content must never appear in normal logs.

```bash
docker compose ps
docker compose logs --since=30m app worker caddy
curl -fsS https://meetwise.example.com/api/v1/health
curl -fsS https://meetwise.example.com/api/v1/ready
```

Use request IDs to correlate reverse-proxy and API events. Restrict log access because opaque user/workspace IDs and operational metadata are still sensitive.

## Worker and Ollama incidents

Analysis is durable. When Ollama is unavailable, jobs retry with bounded exponential delay and eventually become `failed` with a sanitized reason. Users with analysis permission can retry from the dashboard. Restore Ollama, confirm the model appears in `/api/tags`, and retry failed meetings; do not manually mark jobs completed.

Multiple worker replicas safely claim different jobs with row locks. `OLLAMA_MAX_CONCURRENCY` controls concurrent claims per worker; size the total across replicas to server capacity.

## Graceful shutdown

API handles SIGTERM by stopping new accepts, draining in-flight requests up to 25 seconds, then closing the PostgreSQL pool. Worker stops claiming new jobs and closes its pool. Container orchestrator termination grace should exceed 30 seconds.

## Account and session response

Disable a compromised account in PostgreSQL only as an emergency measure, then revoke `web_sessions` and `extension_sessions`; application administration for account status is intentionally not exposed in this release. Users can revoke all of their sessions from account settings. A stolen extension refresh credential becomes invalid after successful rotation or explicit logout/revocation.

## Retention and deletion

Meeting deletion is soft deletion and immediately hides the meeting from normal tenant queries. Automated retention is not claimed or scheduled in this release. Operators must define a legal retention procedure, purge records with reviewed SQL if required, and account for backup retention separately. Test purge queries against a restored copy first.

## Dependency and supply-chain maintenance

CI runs lockfile installation, lint, strict typecheck, unit/integration tests, all builds, migration execution, dependency audit, secret scan, CodeQL, and container configuration/build. Review Dependabot changes, provenance, post-install scripts, and lockfile diffs. Never merge a dependency bump solely because CI is green.
