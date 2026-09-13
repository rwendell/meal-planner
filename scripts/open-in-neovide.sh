#!/usr/bin/env bash
# Open a file in Neovide (Windows build, Neovim running in WSL) at a
# given line/column. Used via LAUNCH_EDITOR for the Svelte inspector
# (Vite dev only). Called with 3 args: filename, line, column.
#
# Override the binary location with NEOVIDE_BIN if yours lives elsewhere
# (e.g. on a laptop with a different install path).
set -euo pipefail

file="${1:?usage: open-in-neovide.sh <file> [line] [column]}"
line="${2:-1}"
col="${3:-1}"

neovide_bin="${NEOVIDE_BIN:-/mnt/c/Program Files/Neovide/neovide.exe}"

# --wsl runs Neovim inside WSL, so WSL paths work as-is. --fork returns
# immediately so the dev-server request doesn't hang. The +call positions
# the cursor after the file loads (1-based line and column).
exec "$neovide_bin" --wsl --fork "$file" -- "+call cursor(${line},${col})"
