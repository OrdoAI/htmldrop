---
name: htmldrop
description: >-
  Upload HTML or Markdown files to baseurl.ai for shareable, password-protected
  preview links. Use whenever the user wants to share, publish, or get a link
  for any local HTML or Markdown content — even implicitly, like after generating
  an HTML report that someone else needs to see. If the user has renderable
  content they want accessible via URL, this is the right tool.
argument-hint: <file>
allowed-tools: Bash
---

!`which htmldrop 2>/dev/null && echo "✓ htmldrop available" || echo "⚠ not installed — run: curl -fsSL https://baseurl.ai/cli/install | bash"`

## Usage

```bash
htmldrop <file>
```

The CLI accepts absolute paths, relative paths, `~/…`, and `file://` URIs — it
resolves them internally, so pass whatever the user gives you.

HTML files are uploaded with referenced local assets (images, CSS, JS)
automatically inlined as base64. Markdown (`.md`, `.markdown`) is rendered to
GitHub-flavored HTML first. Use `--no-inline` only if the user explicitly asks
to skip inlining.

## Output

```
https://baseurl.ai/xK4mN2
  id: xK4mN2 · expires: 2026-06-23
  (copied to clipboard)
```

The first line (stdout) is the shareable URL — password-protected, no account
needed to view. On macOS the URL is auto-copied to clipboard. The expiry date
appears on stderr.

Tell the user the URL, that it's on their clipboard, and when it expires.

## Install

If `htmldrop` is not found:

```bash
curl -fsSL https://baseurl.ai/cli/install | bash
```

If markdown conversion fails, install `marked`: `npm i -g marked`.
