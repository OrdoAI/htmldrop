# Repository Guidelines

## Project Structure & Module Organization

HTMLDrop is a Cloudflare Worker that serves temporary, password-bearing HTML
and Markdown previews at `baseurl.ai`.

- `src/index.ts` is the Worker entrypoint and route dispatcher.
- `src/upload.ts`, `src/serve.ts`, `src/auth.ts`, `src/security.ts`, and `src/utils.ts` hold core behavior.
- `src/serve.ts` also handles `GET /:id/v` version probes and injects the stale-preview refresh notice; `src/auth.ts` owns the `PageRecord.version` field used for revalidation.
- `src/pages/` contains server-rendered HTML pages.
- `src/__tests__/` contains Vitest tests that run with the Cloudflare Workers test pool.
- `cli/` contains the published `htmldrop-cli` package and install script.
- `skills/htmldrop/SKILL.md` documents agent usage of the CLI.
- `.github/workflows/` deploys the Worker and publishes the CLI.

## Build, Test, and Development Commands

- `npm run dev` starts local Wrangler development.
- `npm run typecheck` runs `tsc --noEmit` with strict TypeScript settings.
- `npm test` runs the Cloudflare Worker Vitest suite.
- `npm run test:cli` runs the pure Node CLI compression and upload tests.
- `npm run test:cli:shell` runs the shell CLI integration tests; it is local-only because it depends on host tools.
- `npm run test:browser-compression` runs the browser compression regression test; it is local-only because it needs Chrome.
- `npm run build` performs a Wrangler dry-run deploy into `dist/`.
- `npm run deploy` deploys the Worker with Wrangler.

Use `npm ci` for root dependencies and `npm ci --prefix cli` for CLI package
dependencies when validating from a clean dependency state.

## Coding Style & Naming Conventions

Use TypeScript ES modules and strict typing. Keep route decisions in
`src/index.ts`; put reusable protocol, auth, or security logic in focused
helpers. Prefer small pure functions for behavior that needs tests. Existing
code uses two-space indentation, double quotes, semicolons, and camelCase names.
Worker test files use `*.test.ts`; CLI regression tests live under
`cli/__tests__/` as Node `.mjs` tests.

## Testing Guidelines

Vitest is configured through `@cloudflare/vitest-pool-workers` in
`vitest.config.ts`, with Miniflare bindings for R2 and `AUTH_SECRET`. Add
focused Worker tests beside related behavior under `src/__tests__/`. For CLI
behavior, add focused tests under `cli/__tests__/` and expose them through
`cli/package.json` when they should run in CI.

For auth, transport, upload, or asset inlining changes, cover both success and
rejection or fallback paths, including headers, status codes, payload size, and
package contents when relevant. Run `npm run typecheck`, `npm test`, and
`npm run test:cli` before handing off changes that touch runtime behavior.

## Commit & Pull Request Guidelines

The history uses conventional commits, for example
`fix: align HEAD preview responses with GET` and
`docs: harden htmldrop skill workflow`. Use `fix:`, `feat:`, `docs:`, `ci:`,
or `chore:` based on intent. PRs should explain user-visible behavior, list
validation commands, and call out deploy, publish, or post-deploy checks. For
production-facing security changes, include concrete `curl` probes when
relevant.

## Security & Configuration Tips

Preview URLs include access passwords as query parameters; treat returned links
as secrets. Do not commit `.dev.vars`, API keys, generated `dist/`, or local
`.claude/` state. Production deploys are triggered by pushes to `main` and
require Cloudflare secrets configured in GitHub Actions. CLI publishes are
triggered by changes under `cli/`; bump `cli/package.json` and
`cli/package-lock.json` together before publishing a new npm version.
