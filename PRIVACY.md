# Privacy

Meetwise is self-hosted. The Chrome extension captures caption text, displayed speaker names, relative timestamps, meeting title, and start/end time from Google Meet. It sends those fields to the configured Meetwise server. The server stores them in SQLite and sends bounded transcript content to the server operator's Ollama instance for analysis.

Workspace access follows roles: owners/admins manage members and meeting data, members create/read/analyze according to policy, and viewers are read-only. Host, database-volume, and backup administrators may technically access all stored data. Deployers must document and restrict that access.

Meetwise enables no telemetry, analytics, advertising, tracking, cloud model, or hidden cloud dependency by default. External reverse proxies, log processors, backup targets, or remote Ollama change the data boundary and are the operator's responsibility.

## Local extension data

Extension credentials and a bounded retry queue live in `chrome.storage.local`. The queue prevents transcript loss during outages or service-worker suspension. Logout removes credentials but does not silently delete unsent transcripts. The explicit delete action removes the queue and capture checkpoint.

## Retention, deletion, and backups

Automated retention is not claimed. Authorized owner/admin deletion soft-deletes a meeting and hides it from normal APIs. Permanent purge is an operator-reviewed procedure. SQLite backups may retain deleted data until backup retention expires. Backups contain personal/confidential data and require encryption, access control, and policy-based destruction.

The application does not provide encryption at rest. Use encrypted local storage. Deleting an extension queue does not delete a server copy; deleting a server meeting does not erase independent backups.

## Consent and responsibility

Caption and participant-name collection may be regulated as recording or employee/customer data. Users and workspace operators are responsible for notice, lawful basis/consent, Google Meet terms, access requests, retention, and applicable privacy/employment law. LLM output requires human review.
