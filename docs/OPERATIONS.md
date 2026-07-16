# Operations

## Health and logs

- `GET /api/v1/health` is process liveness.
- `GET /api/v1/ready` checks SQLite and the configured Ollama model.
- JSON request logs include request ID, method, route, status, and duration. Audit events are in SQLite. Credentials, cookies, authorization headers, database URLs, prompts, and transcript content must not appear in normal logs.

```bash
docker compose ps
docker compose logs --since=30m app worker caddy
curl -fsS https://meetwise.example.com/api/v1/health
curl -fsS https://meetwise.example.com/api/v1/ready
```

## SQLite capacity and incidents

Keep the named volume on local SSD storage with free space monitoring. Do not use NFS, SMB, distributed filesystems, or mount the same database on multiple hosts. SQLite serializes writers; occasional waits are normal and bounded by `DATABASE_BUSY_TIMEOUT_MS`. Repeated `SQLITE_BUSY` errors mean storage is slow or write load exceeds this edition's intended scale. Reduce analysis concurrency, inspect disk latency, and migrate to the PostgreSQL edition if sustained contention remains.

WAL and shared-memory files next to the database are active runtime state. Never copy only the main `.db` file while processes are running. Use `npm run backup`, which performs `VACUUM INTO` and produces a consistent standalone file.

## Worker and shutdown

Failed Ollama calls retry with bounded exponential delay and eventually become `failed`; authorized users can retry. A write transaction serializes each claim, stale locks recover automatically, and the Ollama request occurs after commit. Run one worker service per host. `OLLAMA_MAX_CONCURRENCY=1` is the recommended default for small deployments.

API handles SIGTERM by draining requests for up to 25 seconds, then closes the SQLite client. Worker stops claiming work and closes its client. Stop both cleanly before restore or direct database maintenance.

## Accounts, retention, and maintenance

Users can revoke all sessions from account settings. Emergency account disable/revocation may be performed with reviewed SQLite statements while services are stopped; application account-status administration is not exposed in this release.

Meeting deletion is a soft delete. Automated retention is not claimed. Operators must define and test a purge procedure and account separately for backup retention. Run `PRAGMA integrity_check` during restore drills, keep encrypted verified backups, monitor disk use, and periodically test login plus transcript/analysis recovery.

CI runs lockfile installation, formatting, lint, strict typecheck, unit and SQLite integration tests, builds, migration execution, dependency audit, secret scan, CodeQL, and container validation.
