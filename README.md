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
npx -y htmldrop-cli --public --expires 30 ./report.html
npx -y htmldrop-cli --expires 3 --no-renew ./report.html
npx -y htmldrop-cli update "https://baseurl.ai/<id>?p=<password>" ./report.html
npx -y htmldrop-cli settings "https://baseurl.ai/<id>?p=<password>" --public --expires 30
npx -y htmldrop-cli comments "https://baseurl.ai/<id>?p=<password>"
```

The CLI accepts relative paths, absolute paths, `~/...`, and `file://` URIs.
Markdown files are converted to HTML before upload. Relative images, CSS, and
JavaScript files are inlined by default. PNG and JPEG assets are re-encoded to
same-dimension WebP when that reduces the upload payload.

The bare form and `create` make a new preview. `update <url> <file>` overwrites
an existing preview while keeping the same password-bearing URL. `settings <url>`
changes a live preview's visibility (`--public` / `--private`), expiry
(`--expires <days>`, counted from now), and renew-on-visit (`--renew` /
`--no-renew`) without uploading it again. `comments <url>` prints the preview's
comments as JSON; `update --comment-anchors <file>` re-anchors them after the
document changed (see `skills/htmldrop/SKILL.md`).

`--public` also opens the preview at its bare URL, `--expires <days>` (1 to 30,
default 14) sets the expiry window, and `--no-renew` deletes the preview on its
date instead of restarting the window on each visit. See Security Notes for the
exact semantics.

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
npm run test:pages
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
- `src/auth.ts` and `src/security.ts` contain auth, expiry, version, and transport security logic.
- `src/envelope.ts` is the encryption-at-rest layer; `src/cleanup.ts` is the daily expiry sweep.
- `src/comments.ts`, `src/widget.ts`, and `src/anchor.ts` implement reviewer comments and quote anchoring.
- `src/pages/` contains server-rendered HTML pages.
- `src/__tests__/` contains Vitest tests using the Cloudflare Workers test pool.
- `cli/` contains the npm CLI package and CLI-specific tests.
- `scripts/` contains the operator scripts (`pin-page.mjs`, `migrate-encrypt.mjs`) and
  regression scripts; `pages-script.test.mjs` runs in CI, `browser-compression.test.mjs` is local-only.
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

Previews are private by default: only the password link opens them. A preview
uploaded with `public: true` (CLI `--public`, or the checkbox on the home
page) also opens at its bare `https://baseurl.ai/<id>` URL. Its content key
is stored beside the ciphertext, so a public page is readable, and with bucket
access editable, by the operator; the guarantees above apply to private pages.
Anonymous readers of a public page get no comment widget; the password link
(the "edit link") still does.

Production HTTP requests are redirected to HTTPS. HTTPS responses include HSTS.
New links are deleted after 14 days without a visit by default, or after
`expiresInDays` (1 to 30; CLI `--expires`, or the selector on the home page).
Each visit that opens the page restarts that window (`renewOnView`, on by
default), up to one year after the upload or last settings change that set the
window. `renewOnView: false` (CLI `--no-renew`, or the switch on the home
page) deletes the page on its date, opened or not. Turning renew off on an
existing page keeps the date it was showing: the window start moves to the
last visit, so turning renew back on later counts the one-year cap from that
visit (never later than a new `expiresInDays` would put it). Pages stored before renew
existed keep their fixed date, and one stored without a window still means
seven days. The last visit lives in a small plaintext `seen:<id>` object
beside the page, written at most about once a day, so someone with bucket
access can keep a renewing page alive up to its authenticated one-year cap, or
let it lapse early; fixed-date pages are unaffected. An expired page is purged
on its next read, and a daily cron (`[triggers]` in `wrangler.toml`,
`src/cleanup.ts`) sweeps the ones nobody opens again, along with comments and
visit records whose page is gone. An operator who has been given a page's link
can change it with `node scripts/pin-page.mjs "<url>" --pin|--unpin|--renew|
--public|--private|--expires <days>|--renew-on-view|--no-renew-on-view`; the
link is required because the metadata lives inside the ciphertext. A pinned page never expires and keeps its pin
across in-place updates; `--unpin` restarts the expiry window from that moment.

`scripts/migrate-encrypt.mjs` is the one-shot migration that sealed the
plaintext records written before this scheme. Run it (dry run by default,
`--apply` to write) only after the Worker that reads the sealed format is
deployed.

Do not commit local secrets, `.dev.vars`, generated `dist/` output, or local
agent state such as `.claude/`.

## Verifying the deployed code

`GET https://baseurl.ai/version` reports the commit the running Worker was
built from and the GitHub Actions run that deployed it:

```json
{"commit":"<sha>","ref":"main","source":"https://github.com/OrdoAI/htmldrop/commit/<sha>","deploy":"https://github.com/OrdoAI/htmldrop/actions/runs/<id>","ci":true}
```

Check that `commit` is on `main` in this repository and that the linked run
deployed that commit. A deploy made outside the workflow (for example
`wrangler deploy` from a laptop) has no build metadata and reports
`"ci": false`. The values are self-reported by the Worker, so this audits an
honest deploy and exposes a casual out-of-band one; it is not proof against an
operator who deliberately forges them.

## Deployment

Pushes to `main` run the Deploy workflow:

1. `npm ci`
2. `npm ci --prefix cli`
3. `npm run typecheck`
4. `npm test`
5. `npm run test:cli`
6. `npm run test:pages`
7. `npx wrangler deploy`

CLI publishing is handled separately by `.github/workflows/publish-cli.yml`
when files under `cli/` or `skills/htmldrop/` change. The publish workflow
installs root and CLI dependencies, runs the same checks, bakes the current
skill's hashes into `cli/skill-tree.json`, checks the package contents, confirms
the `htmldrop-cli` version is unpublished, then publishes to npm.

The CLI refuses to run when the installed skill's hash differs from the baked
one, so a skill edit must ship with a CLI release: bump `cli/package.json` and
`cli/package-lock.json` in the same change, or the publish job fails on the
already-published version and fresh skill installs are reported as outdated.
