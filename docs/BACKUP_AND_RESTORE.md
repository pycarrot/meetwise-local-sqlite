# Backup and restore

The SQLite database contains accounts, memberships, sessions, participant names, transcripts, analyses, and audits. Backups are confidential personal data. Encrypt media, restrict access, define retention, and securely delete expired copies. Meetwise does not claim application-level encryption at rest.

## Consistent backup

The backup command uses SQLite `VACUUM INTO`. It is safe while API and worker are running, includes committed WAL data, checks that the result exists, and creates parent directories.

```bash
DATABASE_URL=file:./data/meetwise.db \
  npm run backup -- --file /secure/backups/meetwise.db
```

For Docker Compose, write through a one-off container with both the database volume and a host backup directory:

```bash
mkdir -p backups && chmod 700 backups
docker compose run --rm \
  -e RUN_MIGRATIONS=false \
  -v "$PWD/backups:/backups" \
  app node scripts/sqlite-backup.mjs --file /backups/meetwise.db
```

Do not use `cp` against a live database and do not omit `-wal`/`-shm` from ad-hoc snapshots. `VACUUM INTO` is the supported online method.

## Restore

Restore is destructive. Stop API and worker cleanly, retain the current database as a rollback copy, and ensure the source is trusted. The script refuses an active WAL/SHM state, validates the backup with `PRAGMA integrity_check`, copies through a temporary file, and atomically renames it.

```bash
docker compose stop app worker
docker compose run --rm \
  -e RUN_MIGRATIONS=false \
  -v "$PWD/backups:/backups:ro" \
  app node scripts/sqlite-restore.mjs --file /backups/meetwise.db
docker compose run --rm app node dist-server/server/cli.js db:migrate
docker compose up -d app worker
```

For a host installation:

```bash
DATABASE_URL=file:./data/meetwise.db \
  npm run restore -- --file /secure/backups/meetwise.db
npm run db:migrate
```

## Verification

At least quarterly, restore into an isolated path, run `db:status` and `PRAGMA integrity_check`, compare counts, inspect synthetic transcript/analysis records, and log in with a recovery account. Record recovery time. Ollama model files are not in the SQLite backup and must be retained separately or re-pulled.
