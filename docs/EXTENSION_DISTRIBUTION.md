# Extension distribution

## Deployment-specific build

Manifest V3 requires host permissions to be declared. Meetwise therefore builds an exact server origin into each production package instead of requesting broad web access:

```bash
EXTENSION_SERVER_URL=https://meetwise.example.com npm run package:extension
```

The command rejects credentials, paths, query strings, fragments, non-HTTP schemes, and HTTP in production. Development `npm run build:extension` defaults to localhost and writes `dist-extension/`; it must not be distributed. The generated manifest permits only Google Meet plus the configured server origin.

The popup Server URL field supports operator-managed `chrome.storage.managed.serverUrl` or a user-selected origin already present in the package permission. A different origin requires rebuilding; this prevents a compromised UI from silently granting arbitrary network access.

## Chrome channels

Preferred options are Chrome Web Store private/unlisted publication or enterprise extension policy with a controlled update URL. Record the resulting extension ID, configure `CORS_ALLOWED_ORIGINS=chrome-extension://<id>`, and test login, refresh, capture, offline queue, retry, logout, and dashboard navigation before rollout. Protect signing keys and restrict who can publish updates.

## Session and local data behavior

The extension never contains a shared API key. Login creates an extension-only session. Its access token is short-lived; the refresh credential is rotated and stored in `chrome.storage.local`. Logout revokes the server session when reachable and always removes local credentials. Unsent transcripts remain in a bounded local queue so logout/server outages do not silently destroy data; the user can explicitly delete queued transcript data from the popup.

Capture state is checkpointed so MV3 service-worker suspension or a page content-script reload can recover the current Google Meet session. Queue items retain one idempotency key across exponential-backoff and manual retries. Uploaded items remain visible until local data is cleared, allowing the user to understand delivery status.

## Release checklist

1. Set the final HTTPS origin and version; build from a clean lockfile checkout.
2. Inspect `dist-extension/manifest.json` for only the expected host permissions.
3. Run extension unit tests and live Google Meet compatibility tests with synthetic captions.
4. Package, checksum, sign/publish, and archive build provenance.
5. Confirm the API CORS allowlist matches the assigned extension ID.
6. Roll out to a pilot group and verify server audit logs without transcript content.
