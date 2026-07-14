# Architecture

```text
Google Meet
  -> Chrome content script (caption DOM observer)
  -> extension service worker
  -> POST http://127.0.0.1:4317/api/meetings/import
  -> JSON local store
  -> React dashboard
  -> POST /api/meetings/:id/analyze
  -> Ollama http://127.0.0.1:11434/api/chat
```

## Data contract

Each meeting contains timestamped caption segments:

```json
{
  "speaker": "เมย์",
  "text": "ข้อความคำบรรยาย",
  "startMs": 0,
  "endMs": 3200
}
```

Speaker ranking uses segment duration when valid durations exist. If imported data has no durations,
the server falls back to Unicode word segmentation and normalized non-whitespace character counts.
The UI exposes the calculation basis so this is not presented as precise microphone talk time.

## Ollama boundary

Only the local server talks to Ollama. The prompt requests strict JSON containing:

- summary bullets
- decisions
- action items with owner and due date
- topics with speaker contributions

Deterministic statistics are calculated in application code, not delegated to the model.

## Persistence

The MVP uses an atomic JSON-file write at `data/meetings.json`. It is suitable for a single local user.
A future multi-user version should use SQLite/Postgres and add authentication, access control, consent
records, encryption, retention policy, and audit logging.
