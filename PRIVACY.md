# Privacy

Meetwise Local is designed to keep meeting data on the user's computer.

## Data processed

- Google Meet caption text;
- speaker names shown by Google Meet;
- relative caption timestamps;
- meeting title and start/end time;
- generated summaries, decisions, action items, and topics.

## Where data goes

- The Chrome extension sends captured data to `http://127.0.0.1:4317`.
- The local server stores meetings in `data/meetings.json`.
- Analysis is sent to the configured Ollama endpoint, which defaults to `http://127.0.0.1:11434`.
- The project does not include analytics, telemetry, advertising, tracking, or a cloud API.

Changing `OLLAMA_URL`, binding the server outside loopback, placing it behind a remote proxy, or modifying the extension can change this privacy boundary. Document and review such changes before use.

## Consent and legal responsibility

Users are responsible for notifying participants, obtaining required consent, following Google Meet terms, and complying with applicable recording, employment, and privacy law. Captions may contain sensitive personal or organizational information.

## Retention and deletion

This version retains meetings until the local data file is removed. Stop the server before deleting `data/meetings.json`. Backups and synced folders may retain additional copies outside this project's control.
