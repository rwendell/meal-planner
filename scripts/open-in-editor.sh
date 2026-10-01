#!/bin/sh
# open-in-editor.sh — LAUNCH_EDITOR target for the Vite/Svelte inspector.
#
# Usage (called by Vite, not by hand):
#   open-in-editor.sh <file> <line> <column>
#
# Behavior: reuse a running Neovim whose cwd is this project (found via
# Neovim's built-in per-process sockets), else open a new terminal window
# with Neovim. Linux-only.
#
# Wiring (package.json "dev" script):
#   env LAUNCH_EDITOR=./scripts/open-in-editor.sh vite dev ...

sock_dir="${XDG_RUNTIME_DIR:-/tmp}"
file=$1
line=${2:-1}
col=${3:-1}

project_root() {
	if command -v git >/dev/null 2>&1; then
		git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null && return
	fi
	pwd
}

nvim_client() {
	# $1 = socket, remaining args passed to nvim in client mode.
	sock=$1
	shift
	nvim --headless --clean --server "$sock" "$@" 2>/dev/null
}

root=$(project_root)

# 1. Reuse: first Neovim server whose cwd is this project.
for sock in "$sock_dir"/nvim.* /tmp/nvim.*; do
	[ -S "$sock" ] || continue
	cwd=$(nvim_client "$sock" --remote-expr "getcwd()") || continue
	[ "$cwd" = "$root" ] || continue
	# Single round trip: open + position atomically, so there is no race
	# between focusing the buffer and moving the cursor. ('' is an escaped
	# quote inside Vim single-quoted strings.)
	escaped=$(printf '%s' "$file" | sed "s/'/''/g")
	nvim_client "$sock" --remote-expr "execute('edit +${line} ${escaped}') | call cursor(${line},${col})"
	exit 0
done

# 2. Fresh instance in a new terminal window. Prefer the emulator this
# shell runs under (walk up to a known terminal), else first available.
terminal=""
pid=$$
while [ "$pid" -gt 1 ]; do
	comm=$(cat "/proc/$pid/comm" 2>/dev/null) || break
	case "$comm" in
		konsole | ghostty | alacritty | kitty | xterm | foot | wezterm | gnome-terminal)
			terminal=$comm
			break
			;;
	esac
	pid=$(awk '{print $4}' "/proc/$pid/stat" 2>/dev/null) || break
done
if [ -z "$terminal" ]; then
	for t in konsole ghostty alacritty kitty xterm; do
		if command -v "$t" >/dev/null 2>&1; then
			terminal=$t
			break
		fi
	done
fi
[ -n "$terminal" ] || exit 0

cd "$root" || exit 0
case "$terminal" in
	konsole) set -- konsole --new-tab --workdir "$root" -e nvim "+${line}" "$file" ;;
	ghostty) set -- ghostty --working-directory="$root" -e nvim "+${line}" "$file" ;;
	alacritty) set -- alacritty --working-directory "$root" -e nvim "+${line}" "$file" ;;
	kitty) set -- kitty --directory="$root" nvim "+${line}" "$file" ;;
	*) set -- "$terminal" -e nvim "+${line}" "$file" ;;
esac
setsid -f "$@" >/dev/null 2>&1
