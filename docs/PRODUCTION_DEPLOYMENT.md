# Production deployment

## 1. Host, DNS, and firewall

Provision a Linux host with Docker Compose, persistent encrypted storage, sufficient RAM for the selected Ollama model, and time synchronization. Point an A/AAAA record such as `meetwise.example.com` at the host. Allow TCP 80/443 and UDP 443 to Caddy. Do not expose PostgreSQL, Ollama, the API container port, or Docker socket publicly.

## 2. Configuration and secrets

Copy `.env.example` to a root-owned `.env` with mode `0600`. Set `PUBLIC_HOST` and matching `PUBLIC_BASE_URL`, a URL-safe random database password (`openssl rand -hex 32`), independent random `SESSION_SECRET` and `TOKEN_SIGNING_SECRET` values of at least 48 characters, and the exact `chrome-extension://<id>` CORS origin. Values containing `development-only`, `change-me`, wildcard CORS, HTTP public URLs, or `TRUST_PROXY=true` fail startup.

For an external PostgreSQL service, replace `DATABASE_URL`, enable `DATABASE_SSL=true`, and normally retain `DATABASE_SSL_REJECT_UNAUTHORIZED=true` with a trusted CA. Do not disable verification merely to bypass a certificate error.

## 3. Database and model

```bash
docker compose up -d postgres ollama
docker compose exec ollama ollama pull "$OLLAMA_MODEL"
docker compose run --rm app node dist-server/server/cli.js db:migrate
docker compose up -d --build
```

The normal app entrypoint takes a PostgreSQL advisory lock and applies pending migrations before listening. For stricter change control, set `RUN_MIGRATIONS=false`, run the one-off migration command during a maintenance window, and start the app afterward. It never seeds or creates an administrator automatically.

## 4. Initial administrator

Pass the password through an environment variable supplied by your secret manager, not a command-line argument:

```bash
docker compose exec \
  -e MEETWISE_ADMIN_EMAIL=admin@example.com \
  -e MEETWISE_ADMIN_PASSWORD \
  app node dist-server/server/cli.js admin:create --name 'Administrator' --workspace 'Company'
```

`MEETWISE_ADMIN_PASSWORD` must already exist in the `docker compose exec` environment. Remove it immediately after creation. The command fails if the email already exists and never uses a default password.

Create additional accounts with `MEETWISE_USER_EMAIL`, `MEETWISE_USER_NAME`, and `MEETWISE_USER_PASSWORD` using `node dist-server/server/cli.js user:create`; then an owner/admin adds the email to a workspace in the dashboard. No password is generated or emailed by the service.

## 5. TLS and reverse proxy

The included Caddy service obtains public certificates and forwards only to the internal app network. Confirm `curl -fsS https://meetwise.example.com/api/v1/health`. Keep `TRUST_PROXY=1` only when exactly one proxy hop exists. If a load balancer is inserted, set an exact hop count or trusted subnet and review client-IP rate limiting.

## 6. Extension release

```bash
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

The production build refuses HTTP and embeds only the exact deployment origin as a host permission. Publish through Chrome Web Store private/unlisted channels or enterprise policy. After Chrome assigns an extension ID, update `CORS_ALLOWED_ORIGINS` and restart the API. Details are in `EXTENSION_DISTRIBUTION.md`.

## Upgrade and rollback

1. Read release notes and take a verified backup.
2. Pull/build the new image and run migrations.
3. Start app and worker; inspect `/api/v1/ready` and structured logs.
4. Build and distribute a matching extension if protocol or origin changed.

Application rollback is `docker compose up` with the prior image. Database rollback is restore-from-backup unless a release explicitly ships a reversible down migration. Never run an older binary against a newer schema without compatibility confirmation.

## Recovery and rotation

Rotate one secret at a time. Changing `TOKEN_SIGNING_SECRET` invalidates all access tokens; revoke extension sessions or rotate the secret during a communicated maintenance window. Changing `SESSION_SECRET` changes audit IP hashes and other keyed hashes but opaque web sessions remain database-backed. Rotate the database password by updating PostgreSQL and `.env` atomically. See `OPERATIONS.md` and `BACKUP_AND_RESTORE.md`.
