# Meetwise Local

[![CI](https://github.com/pycarrot/meetwise-local/actions/workflows/ci.yml/badge.svg)](https://github.com/pycarrot/meetwise-local/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pycarrot/meetwise-local/actions/workflows/codeql.yml/badge.svg)](https://github.com/pycarrot/meetwise-local/actions/workflows/codeql.yml)
[![Source available](https://img.shields.io/badge/license-source--available-orange)](LICENSE.md)

Meetwise is a self-hosted, multi-user meeting transcript and analysis service. Users install only the Chrome extension, sign in to an operator-managed HTTPS server, and view authorized workspace data in the web dashboard. PostgreSQL is the system of record and Ollama runs only on the server.

> **License:** the repository is public source/source-available, not OSI-approved open source. It retains the Apache 2.0 + Commons Clause and additional restrictions inherited from Google Meet CC Capturer. Commercial sale, resale, competing distribution, and commercial SaaS use are restricted. See [LICENSE.md](LICENSE.md) and [NOTICE.md](NOTICE.md). No license or attribution was changed by the server architecture work.

## Architecture

```text
Chrome extension -> HTTPS/Caddy -> Express API -> PostgreSQL
                                      |              |
                                      v              v
                                  React dashboard  job worker -> Ollama
```

- Web authentication uses revocable opaque sessions in HttpOnly, SameSite cookies and per-session CSRF tokens.
- Extension authentication uses a short-lived signed access token and a rotating, revocable extension-only refresh credential.
- Every meeting and query is scoped by a backend-validated workspace membership.
- Roles are `owner`, `admin`, `member`, and `viewer`; centralized policy definitions live in `packages/shared/permissions.ts`.
- Analysis runs asynchronously through a PostgreSQL job table. Transcript content is treated as untrusted input and never written to normal logs.
- No telemetry, external analytics, cloud LLM, or hidden hosted dependency is enabled.

See [Architecture](docs/ARCHITECTURE.md) and [Threat model](docs/THREAT_MODEL.md).

## Production quick start

Requirements: Docker Engine with Compose v2, a DNS name pointing to the host, inbound TCP 80/443 and UDP 443, and adequate disk/RAM for PostgreSQL and Ollama.

```bash
cp .env.example .env
# Fill PUBLIC_HOST, POSTGRES_PASSWORD, SESSION_SECRET, TOKEN_SIGNING_SECRET,
# CORS_ALLOWED_ORIGINS and the matching EXTENSION_SERVER_URL.
docker compose up -d postgres ollama
docker compose exec ollama ollama pull llama3.2
docker compose up -d --build

export MEETWISE_ADMIN_EMAIL=admin@example.com
read -s MEETWISE_ADMIN_PASSWORD && export MEETWISE_ADMIN_PASSWORD
docker compose exec -e MEETWISE_ADMIN_EMAIL -e MEETWISE_ADMIN_PASSWORD app \
  node dist-server/server/cli.js admin:create --name 'Administrator' --workspace 'My workspace'
unset MEETWISE_ADMIN_PASSWORD
```

Generate application secrets with a cryptographically secure tool such as `openssl rand -base64 48`; never reuse values. Use a URL-safe database password such as `openssl rand -hex 32` because Compose places it in `DATABASE_URL`. Caddy obtains and renews TLS automatically after DNS is correct. The server intentionally fails fast for weak/default secrets, non-HTTPS server mode, wildcard CORS, or unsafe proxy settings.

Build the deployment-specific extension:

```bash
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

Load the ZIP through an approved Chrome distribution method. After installation, obtain the exact extension ID, set `CORS_ALLOWED_ORIGINS=chrome-extension://<id>`, and restart `app`. See [Production deployment](docs/PRODUCTION_DEPLOYMENT.md) and [Extension distribution](docs/EXTENSION_DISTRIBUTION.md).

## Development

Node.js 22 or 24, PostgreSQL 15+, and Ollama are required. HTTP is accepted only on localhost in local mode.

```bash
cp .env.example .env
# Replace it with the development overrides shown at the bottom of the file.
npm ci
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
DATABASE_URL=postgresql://... npm run test:integration
npm run build
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

## Data migration

Apply versioned migrations before each upgrade:

```bash
npm run db:status
npm run db:migrate
npm run import:legacy -- --file ./data/meetings.json --workspace <workspace-uuid>
```

The legacy importer validates the old JSON, assigns every meeting to the explicit workspace, uses a workspace owner as the importing actor, and runs each meeting insert transactionally. Keep the source file until counts and transcript samples have been verified.

## Operations and privacy

- Liveness: `GET /api/v1/health`; dependency readiness: `GET /api/v1/ready`.
- Production logs are structured JSON with request IDs and redact cookies and authorization headers.
- Backups include transcripts, participant names, accounts, audit events, and analyses; handle them as personal/confidential data.
- The application does not claim encryption at rest. Use encrypted host volumes or an encrypted PostgreSQL service.

Read [Operations](docs/OPERATIONS.md), [Backup and restore](docs/BACKUP_AND_RESTORE.md), [SECURITY.md](SECURITY.md), and [PRIVACY.md](PRIVACY.md) before deployment.

## Known limitations

- Google Meet DOM changes can break caption selectors; the extension falls back to broader semantic containers but releases still require live compatibility testing.
- The application does not provide email delivery, invitation links, password reset email, OIDC, or application-layer encryption at rest. Accounts are created by the CLI and then added to workspaces by an owner/admin.
- PostgreSQL full-text search uses the `simple` dictionary for multilingual predictability; it is substring-insensitive only according to PostgreSQL tokenization, not language-specific stemming.
- Ollama output requires human review. Prompt isolation and schema validation reduce risk but do not make LLM output authoritative.
