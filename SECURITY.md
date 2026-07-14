# Security policy

## Supported versions

Security fixes are applied to the latest release and the `main` branch.

## Reporting a vulnerability

Do not open a public issue. Use [GitHub private vulnerability reporting](https://github.com/pycarrot/meetwise-local/security/advisories/new) and include:

- affected component and version;
- reproduction steps using synthetic data;
- expected impact;
- a suggested mitigation, if available.

Do not include real transcripts, participant identities, access tokens, browser profile data, or organizational secrets.

## Security model

- The server binds to `127.0.0.1` by default and refuses non-loopback binding unless explicitly enabled.
- Captions and analyses are stored locally in `data/meetings.json`.
- Ollama requests go to the configured local endpoint; no cloud model is configured by default.
- The Chrome extension can access Google Meet and the local Meetwise API only.
- Imported payload size, segment count, field length, and request rate are bounded.

## Non-goals

This release is a single-user local application. It does not provide authentication, multi-tenant isolation, encrypted-at-rest storage, enterprise retention policy, or remote internet exposure. Do not expose it publicly without an authenticated reverse proxy, TLS, access controls, and a reviewed data-retention design.
