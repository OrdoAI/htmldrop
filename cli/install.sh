#!/usr/bin/env bash
set -euo pipefail

BIN_DIR="${HOME}/.local/bin"
SCRIPT_URL="https://raw.githubusercontent.com/OrdoAI/htmldrop/main/cli/htmldrop"

mkdir -p "$BIN_DIR"
curl -fsSL "$SCRIPT_URL" -o "${BIN_DIR}/htmldrop"
chmod +x "${BIN_DIR}/htmldrop"

if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
  echo "htmldrop installed to ${BIN_DIR}/htmldrop"
  echo "Add to PATH: export PATH=\"\${HOME}/.local/bin:\$PATH\""
else
  echo "htmldrop installed. Run: htmldrop --help"
fi
