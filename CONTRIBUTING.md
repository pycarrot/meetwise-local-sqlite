# Contributing to Meetwise Local

Thank you for helping improve secure, self-hosted meeting tooling.

## Before you start

- Read [LICENSE.md](LICENSE.md). Contributions and derivative distribution remain subject to the original Apache 2.0 + Commons Clause and additional terms.
- Never use real meeting transcripts, participant names, credentials, or private organizational data in issues, tests, screenshots, or pull requests.
- Open an issue before large architectural changes so maintainers can confirm scope.

## Development setup

```bash
git clone https://github.com/pycarrot/meetwise-local.git
cd meetwise-local
npm install
npm run setup
npm run dev
```

PostgreSQL must be running before setup applies migrations. Use `npm run setup -- --skip-model` when you do not need local Ollama.

## Quality checks

Run before opening a pull request:

```bash
npm run check
DATABASE_URL=postgresql://... npm run test:integration
```

For visible dashboard changes, also run the local server followed by:

```bash
MEETWISE_QA_EMAIL=... MEETWISE_QA_PASSWORD=... npm run qa:visual
```

## Pull requests

- Keep changes focused and explain the user impact.
- Add or update tests for deterministic logic.
- Update `CHANGELOG.md` under an Unreleased section for user-visible changes.
- Document Chrome permission, network, storage, retention, or Ollama prompt changes.
- Use synthetic Thai meeting data in screenshots and fixtures.
- Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Caption selector changes

Google Meet DOM selectors are an unstable integration boundary. When updating them:

1. Keep selectors centralized in `extension/content.js`.
2. Preserve the fallback path.
3. Record the Meet UI date and language used for validation.
4. Avoid logging caption text.

## Contributor license terms

The upstream license includes contributor terms. By submitting a contribution, you confirm that you have the right to contribute it and accept those terms.
