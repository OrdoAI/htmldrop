# HTMLDrop

HTMLDrop is a small Cloudflare Worker for sharing temporary HTML or Markdown
previews. Upload a file, get a password-bearing URL, and send that URL to the
people who need to view it. Existing previews can be updated in place, keeping
the same URL.

The hosted service runs at `https://baseurl.ai`.

## CLI Usage

Run the published CLI with `npx`:

```bash
npx -y htmldrop-cli ./report.html
npx -y htmldrop-cli create ./report.html
npx -y htmldrop-cli ./notes.md
npx -y htmldrop-cli update "https://baseurl.ai/<id>?p=<password>" ./report.html
```

The CLI accepts relative paths, absolute paths, `~/...`, and `file://` URIs.
Markdown files are converted to HTML before upload. Relative images, CSS, and
JavaScript files are inlined by default. PNG and JPEG assets are re-encoded to
same-dimension WebP when that reduces the upload payload.

The bare form and `create` make a new preview. `update <url> <file>` overwrites
an existing preview while keeping the same password-bearing URL.

Useful options:

```bash
npx -y htmldrop-cli --no-inline ./page.html
npx -y htmldrop-cli --version
```

When a preview is updated in place, visitors with an old tab open see a refresh
notice. Refreshing or revisiting the URL revalidates with the Worker and loads
the latest version.

## Local Development

Install root dependencies:

```bash
npm ci
```

Install CLI package dependencies when working on CLI behavior:

```bash
npm ci --prefix cli
```

Run the Worker locally:

```bash
npm run dev
```

Run checks:

```bash
npm run typecheck
npm test
npm run test:cli
npm run build
```

Additional local integration checks:

```bash
npm run test:cli:shell
npm run test:browser-compression
```

`npm run build` performs a Wrangler dry-run deploy into `dist/`.

## Project Layout

- `src/index.ts` is the Worker entrypoint and route dispatcher.
- `src/upload.ts` handles uploads, in-place updates, and preview URL generation.
- `src/serve.ts` serves password-protected previews and update notices.
- `src/auth.ts` and `src/security.ts` contain auth, version, and transport security logic.
- `src/pages/` contains server-rendered HTML pages.
- `src/__tests__/` contains Vitest tests using the Cloudflare Workers test pool.
- `cli/` contains the npm CLI package and CLI-specific tests.
- `scripts/` contains local regression scripts that do not run in CI.
- `skills/htmldrop/SKILL.md` documents agent-facing CLI usage.

## Security Notes

Preview links include the access password in the query string. Treat the full
URL as a secret.

Pages and comments are encrypted at rest. The Worker derives a per-page key
from the link password (HKDF-SHA-256) and stores only a verifier plus
AES-256-GCM ciphertext in R2, with the page id, creation time, version, and pin
flag bound as additional data. Holding the bucket credentials therefore does
not let anyone read a page, learn its password, or silently extend its life:
a record edited without the key fails to decrypt and the page returns 404.
Two limits are inherent. Deletion cannot be prevented by encryption, and the
Worker itself handles the password on every `?p=` request, so this protects
against bucket access and credential leaks, not against a malicious Worker
deploy. See `src/envelope.ts`.

Production HTTP requests are redirected to HTTPS. HTTPS responses include HSTS.
Links expire after seven days. An expired page is purged on its next read, and
a daily cron (`[triggers]` in `wrangler.toml`, `src/cleanup.ts`) sweeps the
ones nobody opens again, along with comments whose page is gone. An operator who has been given a page's link
can exempt it with `node scripts/pin-page.mjs "<url>"`; the link is required
because the pin flag lives inside the ciphertext. A pinned page never expires
and keeps its pin across in-place updates. `--unpin` restores the seven-day
expiry, counted from the moment of unpinning.

`scripts/migrate-encrypt.mjs` is the one-shot migration that sealed the
plaintext records written before this scheme. Run it (dry run by default,
`--apply` to write) only after the Worker that reads the sealed format is
deployed.

Do not commit local secrets, `.dev.vars`, generated `dist/` output, or local
agent state such as `.claude/`.

## Deployment

Pushes to `main` run the Deploy workflow:

1. `npm ci`
2. `npm ci --prefix cli`
3. `npm run typecheck`
4. `npm test`
5. `npm run test:cli`
6. `npx wrangler deploy`

CLI publishing is handled separately by `.github/workflows/publish-cli.yml`
when files under `cli/` change. The publish workflow installs root and CLI
dependencies, runs Worker and CLI tests, checks the package contents, confirms
the `htmldrop-cli` version is unpublished, then publishes to npm.
