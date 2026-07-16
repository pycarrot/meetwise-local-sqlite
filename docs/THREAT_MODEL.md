# Threat model

## Assets and trust boundaries

High-value assets are credentials, workspace membership, transcripts/participant identities, analysis output, audit history, database backups, and deployment secrets. Trust boundaries are Google Meet DOM to content script, extension to HTTPS API, browser cookie to API, API to the local SQLite volume, worker to Ollama, reverse proxy to API, and operator access to containers/backups.

| Threat                             | Primary controls                                                                                                                                                      | Residual risk / operation                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Malicious extension client         | Treat client as untrusted; Zod/size/count limits; authenticated workspace-bound session; server timestamps; idempotency; rate limits; no payload user/workspace trust | Authorized members can submit misleading captions; audit and workspace governance remain necessary. |
| Stolen token                       | Short access TTL; hashed rotating refresh credential; DB revocation/version; logout/revoke-all; no token logs                                                         | Malware with Chrome-profile access can act until revocation/expiry.                                 |
| Cross-workspace access             | Central role policy; membership lookup; every meeting read/delete/analyze query includes workspace; opaque UUID; negative integration tests                           | New repositories/routes must preserve this invariant and receive review.                            |
| Transcript leakage / XSS           | React text escaping; CSP; no transcript logs; scoped API; output schema limits; backup access controls                                                                | Database/server administrators can access plaintext; encrypted volumes are external.                |
| Ollama prompt injection            | Transcript in user message, explicit system instruction that transcript is data, fixed operator URL/model, bounded input, JSON schema validation                      | Model output can still be wrong/manipulative; human review required.                                |
| Denial of service                  | Body/segment/field limits, endpoint rate limits, database timeouts, bounded queue/concurrency/retries, health checks                                                  | Distributed attacks require upstream firewall/WAF capacity planning.                                |
| Compromised admin                  | Audit log, least-privilege roles, last-owner protection, session revocation, no default account                                                                       | Owners and infrastructure admins are powerful; use separate accounts and host controls.             |
| Untrusted Google Meet DOM/captions | Text-only capture, schema validation, React encoding, no HTML interpretation, LLM isolation                                                                           | DOM changes may capture incorrect content; live release tests required.                             |
| Reverse proxy misconfiguration     | HTTPS server-mode fail-fast, exact trust proxy, exact CORS, internal networks, HSTS                                                                                   | Incorrect hop count can weaken IP rate limits; deployment review required.                          |
| Backup exposure                    | Documented personal-data content, encryption/access/retention guidance, restore drills                                                                                | Application cannot enforce external backup controls.                                                |

## Abuse cases reviewed

An attacker who knows another meeting UUID cannot use their own workspace query to read, delete, or enqueue analysis. A replayed upload returns the original result only when extension session, key, and request hash match. Reusing a key with changed data is rejected. A viewer's extension session cannot ingest. Cookie state changes require matching per-session CSRF cookie/header. Disabled/revoked sessions fail authorization. User input never selects `OLLAMA_URL`.

Review this model when adding invitations, OIDC, file uploads, retention automation, metrics, public sharing, external models, or administrator APIs.
