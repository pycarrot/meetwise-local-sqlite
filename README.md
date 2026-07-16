# Meetwise Local SQLite

[![CI](https://github.com/pycarrot/meetwise-local-sqlite/actions/workflows/ci.yml/badge.svg)](https://github.com/pycarrot/meetwise-local-sqlite/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pycarrot/meetwise-local-sqlite/actions/workflows/codeql.yml/badge.svg)](https://github.com/pycarrot/meetwise-local-sqlite/actions/workflows/codeql.yml)
[![Source available](https://img.shields.io/badge/license-source--available-orange)](LICENSE.md)

Meetwise Local SQLite is the small-organization edition of Meetwise: a self-hosted, multi-user meeting transcript and analysis service with no separate database server. Users install only the Chrome extension, sign in to an operator-managed HTTPS server, and use the web dashboard. SQLite is the system of record and Ollama runs only on the server.

This edition targets one application host and modest concurrent use. Choose the [PostgreSQL edition](https://github.com/pycarrot/meetwise-local) for horizontal API/worker scaling or sustained write-heavy workloads.

> **License:** this repository is public source/source-available, not OSI-approved open source. It retains the Apache 2.0 + Commons Clause and additional restrictions inherited from Google Meet CC Capturer. Commercial sale, resale, competing distribution, and commercial SaaS use are restricted. See [LICENSE.md](LICENSE.md) and [NOTICE.md](NOTICE.md).

## Architecture

```text
Chrome extension -> HTTPS/Caddy -> Express API -> SQLite (WAL)
                                      |              |
                                      v              v
                                  React dashboard  job worker -> Ollama
```

- Web authentication uses revocable opaque sessions in HttpOnly, SameSite cookies and per-session CSRF tokens.
- Extension authentication uses short-lived access tokens and rotating, revocable refresh credentials.
- Every data query is scoped by backend-validated workspace membership and centralized role policies.
- SQLite runs with foreign keys, WAL, `synchronous=NORMAL`, a bounded busy timeout, indexed tenant queries, and FTS5 transcript search.
- Analysis uses a durable SQLite job table. Write transactions serialize job claims, stale locks recover automatically, and Ollama work happens outside database transactions.
- No telemetry, external analytics, cloud LLM, or hidden hosted dependency is enabled.

See [Architecture](docs/ARCHITECTURE.md) and [Threat model](docs/THREAT_MODEL.md).

## Production quick start

Requirements: Docker Engine with Compose v2, a DNS name pointing to the host, inbound TCP 80/443 and UDP 443, and adequate disk/RAM for Ollama. Keep the SQLite volume on reliable local storage; do not place it on NFS or share it between hosts.

```bash
cp .env.example .env
# Fill PUBLIC_HOST, SESSION_SECRET, TOKEN_SIGNING_SECRET,
# CORS_ALLOWED_ORIGINS and the matching EXTENSION_SERVER_URL.
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.2
docker compose up -d --build

export MEETWISE_ADMIN_EMAIL=admin@example.com
read -s MEETWISE_ADMIN_PASSWORD && export MEETWISE_ADMIN_PASSWORD
docker compose exec -e MEETWISE_ADMIN_EMAIL -e MEETWISE_ADMIN_PASSWORD app \
  node dist-server/server/cli.js admin:create --name 'Administrator' --workspace 'My workspace'
unset MEETWISE_ADMIN_PASSWORD
```

Generate each application secret independently with a cryptographically secure tool such as `openssl rand -base64 48`. Caddy obtains TLS after DNS is correct. Server mode fails fast for weak/default secrets, non-HTTPS origins, wildcard CORS, or unsafe proxy settings.

Build the deployment-specific extension:

```bash
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

After installation, obtain the exact extension ID, set `CORS_ALLOWED_ORIGINS=chrome-extension://<id>`, and restart `app`. See [Production deployment](docs/PRODUCTION_DEPLOYMENT.md) and [Extension distribution](docs/EXTENSION_DISTRIBUTION.md).

## Development

Node.js 22 or 24 and Ollama are required. SQLite is embedded; no database service is needed. HTTP is accepted only on localhost in local mode.

```bash
npm ci
npm run setup
npm run db:migrate
MEETWISE_ADMIN_EMAIL=dev@example.test \
MEETWISE_ADMIN_PASSWORD='DevelopmentOnly7Password' npm run admin:create
npm run dev
npm run build:extension
```

Quality commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

## Data migration and operations

```bash
npm run db:status
npm run db:migrate
npm run import:legacy -- --file ./data/meetings.json --workspace <workspace-uuid>
npm run backup -- --file ./backups/meetwise.db
```

The importer validates legacy JSON and assigns every meeting to an explicit workspace. Backups use SQLite `VACUUM INTO`, producing a consistent standalone database while WAL mode is active.

- Liveness: `GET /api/v1/health`; dependency readiness: `GET /api/v1/ready`.
- Logs are structured JSON and redact cookies and authorization headers.
- The SQLite database and backups contain transcripts, participant names, accounts, audits, and analyses. Encrypt the host volume and backup media; Meetwise does not claim application-level encryption at rest.

Read [Operations](docs/OPERATIONS.md), [Backup and restore](docs/BACKUP_AND_RESTORE.md), [SECURITY.md](SECURITY.md), and [PRIVACY.md](PRIVACY.md) before deployment.

## Known limitations

- This edition is single-host. API and worker may be separate processes on the same host and shared local volume, but multiple hosts and network filesystems are unsupported.
- SQLite serializes writers. WAL keeps readers responsive, but very high simultaneous ingestion or admin write traffic belongs on the PostgreSQL edition.
- Google Meet DOM changes can break caption selectors; releases require live compatibility testing.
- Email invitations, password reset email, OIDC, and application-layer encryption at rest are not included.
- FTS5 uses Unicode tokenization without Thai dictionary segmentation; exact phrase/prefix behavior depends on token boundaries.
- Ollama output requires human review even with prompt isolation and schema validation.
