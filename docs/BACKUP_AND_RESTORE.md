# Backup and restore

PostgreSQL contains accounts, memberships, session records, meeting titles, participant names, full transcripts, analysis output, and security audit events. Backups therefore contain personal and potentially confidential data. Encrypt backup media, restrict access, document retention, and securely delete expired copies. Meetwise does not implement or claim application-level encryption at rest.

## Host client tools

With PostgreSQL client tools installed and `DATABASE_URL` set:

```bash
npm run backup -- --file /secure/backups/meetwise.dump
npm run restore -- --file /secure/backups/meetwise.dump
npm run db:migrate
```

The scripts use the custom `pg_dump`/`pg_restore` format, omit ownership/ACL restoration, verify the input/output path, and display a clear error if the binaries are unavailable. `restore` uses `--clean --if-exists` and is destructive to the target database; restore only into an isolated or intentionally replaced database.

## Docker Compose

```bash
mkdir -p backups && chmod 700 backups
docker compose exec -T postgres pg_dump -U meetwise -d meetwise -Fc --no-owner --no-acl > backups/meetwise.dump

# Restore into an empty maintenance database/container after stopping app and worker:
docker compose stop app worker
docker compose exec -T postgres pg_restore -U meetwise -d meetwise --clean --if-exists --no-owner --no-acl < backups/meetwise.dump
docker compose run --rm app node dist-server/server/cli.js db:migrate
docker compose up -d app worker
```

Do not rely on a Docker volume snapshot taken while PostgreSQL is running unless the storage system provides application-consistent snapshots.

## Verification

At least quarterly, restore into an isolated PostgreSQL instance, run `db:status`, count users/workspaces/meetings/segments, inspect synthetic transcript and analysis records, log in with a recovery account, and record recovery time. A backup is not accepted until restoration succeeds. Keep the Ollama model volume or re-pull the documented model; model binaries are not in the PostgreSQL backup.
