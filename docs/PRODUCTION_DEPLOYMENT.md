# Production deployment

## Host, DNS, and storage

Provision one Linux host with Docker Compose, reliable local SSD storage, enough RAM for Ollama, time synchronization, and an encrypted disk. Point DNS at the host and allow TCP 80/443 plus UDP 443 to Caddy. Do not expose Ollama, the app container port, or Docker socket. The SQLite volume must not use NFS/SMB and must not be mounted by another host.

## Configuration and startup

Copy `.env.example` to a root-owned `.env` mode `0600`. Set `PUBLIC_HOST`, independent `SESSION_SECRET` and `TOKEN_SIGNING_SECRET` values of at least 48 random characters, and the exact `chrome-extension://<id>` CORS origin. Unsafe defaults, HTTP server origins, wildcard CORS, `TRUST_PROXY=true`, non-file database URLs, and in-memory production databases fail startup.

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull "$OLLAMA_MODEL"
docker compose run --rm app node dist-server/server/cli.js db:migrate
docker compose up -d --build
```

The app entrypoint applies pending migrations before listening. Migrations are serialized by SQLite's write transaction. For stricter change control set `RUN_MIGRATIONS=false`, run the one-off command during maintenance, then start. Startup never seeds data or creates credentials.

## Initial administrator

```bash
docker compose exec \
  -e MEETWISE_ADMIN_EMAIL=admin@example.com \
  -e MEETWISE_ADMIN_PASSWORD \
  app node dist-server/server/cli.js admin:create --name 'Administrator' --workspace 'Company'
```

Supply the password from a secret manager/environment, never as a command argument, and remove it afterward. Use `user:create` for additional accounts, then add them to workspaces in the dashboard.

## TLS and extension

Caddy obtains certificates and forwards only to the internal app network. Keep `TRUST_PROXY=1` when exactly one proxy hop exists. Confirm the health endpoint, then build the deployment-specific extension:

```bash
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

The build refuses production HTTP and embeds only the exact deployment origin. After Chrome assigns an ID, update `CORS_ALLOWED_ORIGINS` and restart the app.

## Upgrade, rollback, and scaling boundary

1. Read release notes and take a verified `VACUUM INTO` backup.
2. Stop app/worker for schema-changing maintenance when release notes require it.
3. Build/pull the image and run migrations.
4. Start services; inspect readiness and logs.

Application rollback uses the prior image. Schema rollback is restore-from-backup unless a release explicitly documents compatibility. Never run an older binary against a newer schema without confirmation.

This edition supports a single application host. Do not scale app/worker across machines or use a network filesystem. Move to the PostgreSQL edition before horizontal scaling or sustained high write concurrency.

Changing `TOKEN_SIGNING_SECRET` invalidates access tokens. Changing `SESSION_SECRET` changes keyed audit hashes while opaque sessions remain database-backed. Secret rotation does not re-encrypt the SQLite file; use encrypted host and backup storage.
