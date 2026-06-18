---
name: htmldrop
description: >-
  Upload local HTML or Markdown artifacts to baseurl.ai and return a shareable,
  password-bearing preview URL. Use this skill whenever the user asks to
  publish, share, host, preview, send a link for, or make accessible any local
  .html, .htm, .md, or .markdown file, including reports or documents you just
  generated. Also use it when a workflow produces renderable local content and
  the next useful step is a URL someone else can open. Do not use it for
  production deployments, long-term hosting, or non-renderable source files
  unless you first create a local HTML or Markdown artifact.
argument-hint: <file>
allowed-tools: Bash
---

# HTMLDrop

Use this skill to turn a local HTML or Markdown artifact into a temporary
baseurl.ai preview URL. The full URL includes the access password as `?p=...`;
anyone with that full URL can view the page.

## Before Uploading

1. Identify the artifact to upload.
   - If the user gave a path, use that exact file after confirming it exists.
   - If you just generated an HTML or Markdown report, use that generated file.
   - If several candidate files exist and the user did not identify one, choose
     the most relevant recently generated `.html`, `.htm`, `.md`, or
     `.markdown` file only when the context is unambiguous. Otherwise ask one
     concise question.
2. Check content sensitivity before upload.
   - If the file appears to contain credentials, private keys, tokens, secrets,
     or data the user did not intend to share externally, stop and ask before
     uploading.
   - Treat the returned URL as a secret-bearing link because the password is in
     the query string.
3. Use HTMLDrop only for renderable artifacts. If the user asks to share raw
   source, logs, JSON, CSV, or other non-renderable files, first create a small
   HTML or Markdown wrapper when that matches the request; otherwise explain
   that this skill is for HTML/Markdown previews.

## Command

Run the published CLI through `npx`:

```bash
npx -y htmldrop-cli "<file>"
```

The CLI accepts relative paths, absolute paths, `~/...`, and `file://` URIs.
Quote the path so spaces are handled correctly.

Use endpoint overrides only when the user or environment calls for them:

```bash
HTMLDROP_URL="https://baseurl.ai" npx -y htmldrop-cli "<file>"
npx -y htmldrop-cli -e "https://baseurl.ai" "<file>"
```

Use `--no-inline` only when the user explicitly wants references left as-is or
when the default inlining makes the upload too large:

```bash
npx -y htmldrop-cli --no-inline "<file>"
```

## Verified CLI Behavior

- Markdown files (`.md`, `.markdown`) are rendered to GitHub-flavored HTML
  before upload.
- Relative `<img src>`, `<link href>`, and `<script src>` references are
  inlined by default. Remote URLs, data URLs, fragment links, and JavaScript
  URLs are left alone.
- `--no-inline` leaves local references untouched.
- The service accepts an HTML payload up to 24 MiB and has a 25 MiB request-body
  guard. Asset inlining and Markdown rendering can make the final payload larger
  than the original file.
- The upload response contains a URL shaped like
  `https://baseurl.ai/<id>?p=<password>`. Links expire after 7 days according to
  the service response.
- In non-interactive shells the CLI prints the URL on stdout. In an interactive
  TTY it also prints `id`, an expiry date, and a clipboard note when `pbcopy`
  succeeds.

## Handling Output

Read both stdout and stderr from the command.

- The first stdout line is the shareable URL. Give that URL to the user.
- Mention the 7-day expiry policy. If the CLI printed an exact expiry date,
  relay that date. If it did not print one, do not invent an exact timestamp.
- Say the link is self-authenticating because the password is already in the
  URL. Do not print the password separately unless the user asks.
- Only say the URL was copied to the clipboard if the CLI actually printed the
  clipboard message.
- If stderr reports asset warnings such as `not found`, surface them. A URL may
  still be created, but unresolved local references can make the remote preview
  incomplete.

Suggested final response:

```text
Uploaded: <url>
The link includes the access password and can be forwarded as-is. HTMLDrop
links expire after 7 days.
```

Add a short warning line when relevant:

```text
Warning: 2 local assets were not found during upload, so the remote preview may
be missing those images or styles.
```

## Troubleshooting

- `file not found`: re-check the path with `ls -l` or use an absolute path.
- `markdown conversion failed`: the CLI could not render Markdown through
  `marked`; report the exact error and ask whether to install or use an HTML
  export instead.
- `File too large` or HTTP `413`: the final HTML payload exceeded the service
  limit. Try `--no-inline`, reduce embedded assets, split the report, or create
  a smaller summary page.
- `upload failed`: report the exact status and stderr. Do not claim a URL was
  created unless stdout contains one.
- Asset warnings: if the preview needs to be portable, resolve missing local
  assets and upload again.
