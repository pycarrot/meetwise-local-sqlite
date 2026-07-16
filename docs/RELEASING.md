# Release process

1. Ensure `main` is green and the working tree is clean.
2. Update the version in `package.json`; the extension manifest version is injected from it.
3. Move relevant `CHANGELOG.md` entries into a dated release section.
4. Run `npm ci`, the SQLite integration suite, and `EXTENSION_SERVER_URL=https://the-release-origin.example npm run check`.
5. Commit with `chore: release vX.Y.Z`.
6. Create and push an annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
7. Configure the repository `EXTENSION_SERVER_URL` variable to the intended production HTTPS origin. The Release workflow verifies the project, packages the origin-specific extension, and creates a GitHub Release.

Use semantic versioning. Selector-only compatibility fixes are patches; backwards-compatible features are minor releases; storage/API breaking changes require a major release or an explicit migration plan while pre-1.0.
