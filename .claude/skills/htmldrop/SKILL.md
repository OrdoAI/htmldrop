---
name: htmldrop
description: Upload HTML or Markdown files to baseurl.ai for shareable preview links. Use when the user wants to share an HTML report, markdown document, or any rendered page with a link.
---

# HTMLDrop CLI

Upload HTML/MD files to baseurl.ai and get a password-protected shareable link.

## Usage

```bash
htmldrop <file>
```

Accepts:
- Absolute paths: `/Users/me/report.html`
- Home-relative: `~/Documents/notes.md`
- file:// URIs: `file:///Users/me/page.html`
- Relative paths: `./output/report.html`

HTML files are uploaded as-is. Markdown files are converted to HTML with GitHub-flavored styling.

## Install

```bash
# Link into PATH (from the htmldrop repo)
ln -sf /Users/notdp/Developer/htmldrop/cli/htmldrop /usr/local/bin/htmldrop
```

## Requirements

- `curl` and `jq` (pre-installed on macOS)
- For Markdown: `marked` CLI (`npm i -g marked`) or `npx`

## Output

When run in a terminal, prints the URL and copies it to clipboard (macOS). When piped, outputs only the URL for scripting.
