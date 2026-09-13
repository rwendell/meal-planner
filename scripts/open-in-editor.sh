#!/usr/bin/env bash
# Route inspector clicks to an already-running Neovim in this project when
# one exists, otherwise fall back to Neovide. Used via LAUNCH_EDITOR for
# the Svelte inspector (Vite dev only).
# Called with 3 args: filename, line, column.
set -euo pipefail

file="${1:?usage: open-in-editor.sh <file> [line] [column]}"
line="${2:-1}"
col="${3:-1}"

# Default RPC sockets live directly in $XDG_RUNTIME_DIR (nvim.<pid>.<n>)
# or nested under $TMPDIR/nvim.$USER/ — never anywhere else.
list_nvim_sockets() {
	local runtime_dir="${XDG_RUNTIME_DIR:-/tmp}"
	local tmpdir="${TMPDIR:-/tmp}"
	local nvim_user="${USER:-$(id -un)}"
	{ find "$runtime_dir" "$tmpdir/nvim.${nvim_user}" \
		-maxdepth 3 -type s -name 'nvim.*' 2>/dev/null || true; } | sort -u
}

run_timeout() {
	if command -v timeout >/dev/null 2>&1; then
		timeout 3 "$@"
	else
		"$@"
	fi
}

project_dir="$(pwd -P)"
while IFS= read -r socket; do
	[ -n "$socket" ] || continue
	# Ask the running instance where it lives instead of parsing PIDs —
	# no lsof needed and stale sockets fail fast.
	cwd="$(run_timeout nvim --server "$socket" --remote-expr 'getcwd()' 2>/dev/null || true)"
	[ "$cwd" = "$project_dir" ] || continue
	if run_timeout nvim --server "$socket" \
		--remote-send "<C-\\><C-N>:n ${file}<CR>:call cursor(${line},${col})<CR>" \
		2>/dev/null; then
		exit 0
	fi
done < <(list_nvim_sockets)

# No project Neovim found — open Neovide instead.
exec "$(dirname "$0")/open-in-neovide.sh" "$file" "$line" "$col"
