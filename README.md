# Meetwise Local

[![CI](https://github.com/pycarrot/meetwise-local/actions/workflows/ci.yml/badge.svg)](https://github.com/pycarrot/meetwise-local/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pycarrot/meetwise-local/actions/workflows/codeql.yml/badge.svg)](https://github.com/pycarrot/meetwise-local/actions/workflows/codeql.yml)
[![Node 20+](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)](package.json)
[![Source available](https://img.shields.io/badge/license-source--available-orange)](LICENSE.md)

จับคำบรรยาย Google Meet เก็บข้อมูลไว้ในเครื่อง วิเคราะห์สัดส่วนผู้พูด และสรุปการประชุมด้วย Ollama โดยไม่ต้องส่ง transcript ไปยัง cloud service

> **License note:** Meetwise Local is public source/source-available, not OSI-approved open source. It is derived from [Google Meet CC Capturer](https://github.com/yunho0130/google-meet-cc-to-srt) and must retain its Apache 2.0 + Commons Clause and additional restrictions. Commercial sale, resale, competing commercial distribution, and commercial SaaS use are restricted. See [LICENSE.md](LICENSE.md) and [NOTICE.md](NOTICE.md).

## What it does

- Companion Chrome extension captures Google Meet captions and displayed speaker names.
- Local API stores timestamped meetings in an atomic JSON store.
- Deterministic analytics ranks speakers by caption duration, with a Unicode spoken-unit fallback.
- Ollama produces structured summaries, decisions, action items, topics, and speaker contributions.
- Thai-first responsive dashboard supports transcript search and speaker filtering.
- No analytics, telemetry, cloud model, or external database is configured.

## Requirements

- Node.js 20 or 22
- Chrome or Chromium-based browser
- [Ollama](https://ollama.com/download)
- 2–5 GB free disk space for a local model

## Quick start

```bash
git clone https://github.com/pycarrot/meetwise-local.git
cd meetwise-local
npm install
npm run setup
npm start
```

`npm run setup` creates `.env`, pulls `llama3.2`, runs all quality checks, builds the dashboard, and packages the extension. Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

To skip the model download for UI-only development:

```bash
npm run setup -- --skip-model
```

## Install the Chrome extension

### From a release ZIP

1. Download `meetwise-local-extension-vX.Y.Z.zip` from [Releases](https://github.com/pycarrot/meetwise-local/releases).
2. Extract the ZIP.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.

### From source

Load the repository's `extension/` folder with the same Chrome steps.

## Capture and analyze a meeting

1. Join Google Meet and enable **CC**. Select Thai as the spoken language when needed.
2. Open **Meetwise Local Capturer** and click **เริ่มจับ**.
3. At the end, click **หยุดและส่ง**.
4. Open the local dashboard and select the new meeting.
5. Click **วิเคราะห์ใหม่** to analyze it with Ollama.

The dashboard shows the summary, speaking share, topic ownership, decisions, action items, and timestamped transcript. Speaking share measures caption segments, not raw microphone audio, and should be treated as an estimate.

## Configuration

Copy `.env.example` to `.env`; `npm run setup` does this automatically.

| Variable                | Default                  | Purpose                               |
| ----------------------- | ------------------------ | ------------------------------------- |
| `HOST`                  | `127.0.0.1`              | API bind address                      |
| `PORT`                  | `4317`                   | Dashboard/API port                    |
| `OLLAMA_URL`            | `http://127.0.0.1:11434` | Ollama API endpoint                   |
| `OLLAMA_MODEL`          | `llama3.2`               | Analysis model                        |
| `MEETWISE_ALLOW_REMOTE` | `false`                  | Explicitly allow non-loopback binding |

The server refuses non-loopback binding unless `MEETWISE_ALLOW_REMOTE=true`. This flag does **not** add authentication or TLS. Read [SECURITY.md](SECURITY.md) before any remote deployment.

## Docker

Keep Ollama running on the host, then run:

```bash
docker compose up --build -d
```

The Compose port remains bound to `127.0.0.1`. The extension continues to use `http://127.0.0.1:4317`.

## Development

```bash
npm run dev               # Vite + local API
npm run lint              # ESLint
npm test                  # deterministic unit tests
npm run build             # TypeScript + production dashboard
npm run package:extension # release ZIP
npm run check             # full required validation
npm run qa:visual         # desktop/mobile interaction and screenshot QA
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/RELEASING.md](docs/RELEASING.md).

## Architecture

```text
Google Meet captions
  -> Chrome content script
  -> extension service worker
  -> loopback Express API
  -> local JSON store
  -> React dashboard
  -> local Ollama API
```

Deterministic speaker statistics stay in application code. The language model receives the transcript only for semantic analysis. Input size, segment count, field length, CORS origins, and request rates are bounded.

## Privacy and consent

Meetwise processes meeting captions and displayed participant names. Notify participants and obtain any consent required by law or organizational policy. Do not commit `data/meetings.json`, real transcripts, or screenshots containing private information.

Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before use.

## Known limitations

- Google Meet can change its DOM and break caption selectors.
- Captions can be inaccurate or omit speaker changes.
- LLM output requires human review before it is used as an official record.
- The current store is intended for one local user, not multi-tenant deployment.
- Data is not encrypted at rest by this application.

## Community

- Bug reports: [Issues](https://github.com/pycarrot/meetwise-local/issues)
- Questions: [Discussions](https://github.com/pycarrot/meetwise-local/discussions)
- Security: [Private vulnerability reporting](https://github.com/pycarrot/meetwise-local/security/advisories/new)
- Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Attribution

Based on Google Meet CC Capturer by Yunho Maeng. Copyright (c) 2024 Yunho Maeng. Original repository: https://github.com/yunho0130/google-meet-cc-to-srt.
