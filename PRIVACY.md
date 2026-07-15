# Privacy

Meetwise is self-hosted. The Chrome extension captures caption text and displayed speaker names from Google Meet, relative timestamps, meeting title, and start/end time. It sends those fields to the Meetwise server configured by the user or organization. The server stores them in PostgreSQL and sends bounded transcript content to the Ollama instance configured by the server operator for analysis.

Workspace members can access data according to role: owners and admins manage members and meeting data, members can create/read/analyze according to policy, and viewers are read-only. Server/database/backup administrators may be technically capable of accessing all stored data. Deployers must document and restrict that administrative access.

Meetwise includes no telemetry, external analytics, advertising, tracking, cloud model, or hidden cloud dependency by default. Configuring an external reverse proxy, PostgreSQL service, log processor, backup target, or remote Ollama changes the data boundary and is the operator's responsibility.

## Local extension data

Extension credentials and a bounded retry queue are stored in the Chrome profile's `chrome.storage.local`. The queue prevents transcript loss during server outages or MV3 service-worker suspension. Logout revokes/removes credentials but deliberately does not silently delete unsent transcripts. “ลบ transcript ที่เก็บใน extension” explicitly deletes the queue and capture checkpoint.

## Retention, deletion, and backups

The current release does not claim automated retention. Meetings remain until an authorized owner/admin deletes them; deletion is a soft delete and hides data from normal APIs. Permanent purge is an operator-reviewed procedure. PostgreSQL backups can retain deleted transcripts and analyses until backup retention expires. Backup files contain personal/confidential data and must be encrypted, access-controlled, and destroyed according to policy.

The application does not provide encryption at rest. Use encrypted storage. Deleting an extension queue does not delete the server copy; deleting a server meeting does not erase independent backups.

## Consent and responsibility

Caption and participant-name collection may be regulated as recording or employee/customer data. Users and workspace operators are responsible for notice, lawful basis/consent, Google Meet terms, access requests, retention, and applicable privacy/employment law. Do not use LLM output as an official record without human review.
