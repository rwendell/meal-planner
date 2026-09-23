/**
 * Copy text to the clipboard.
 *
 * Mobile Safari/Chrome only allow a clipboard write during a user
 * gesture, and `navigator.clipboard` is not exposed outside a secure
 * context (e.g. testing over `http://<lan-ip>`). So the synchronous
 * fallback has to run in the same tick as the tap — never after an
 * `await`, or the gesture is already spent and the write is blocked.
 */
export async function copyText(text: string): Promise<boolean> {
	// Preferred modern path, only available in secure contexts. Called
	// synchronously so the user gesture is still valid.
	if (window.isSecureContext && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return false;
		}
	}

	return legacyCopy(text);
}

/**
 * Synchronous clipboard write for non-secure contexts. The textarea must
 * stay in the layout and be selectable: iOS refuses to copy from
 * `display:none` / `visibility:hidden` / `opacity:0` elements, so we park
 * it on-screen at 1px and hide it with a transparent colour instead.
 */
function legacyCopy(text: string): boolean {
	const selection = document.getSelection();
	const savedRanges: Range[] = [];
	if (selection) {
		for (let i = 0; i < selection.rangeCount; i += 1) {
			savedRanges.push(selection.getRangeAt(i));
		}
	}

	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.setAttribute("aria-hidden", "true");
	area.tabIndex = -1;
	Object.assign(area.style, {
		position: "fixed",
		top: "0",
		left: "0",
		width: "1px",
		height: "1px",
		padding: "0",
		border: "0",
		outline: "none",
		boxShadow: "none",
		background: "transparent",
		color: "transparent",
		fontSize: "16px",
	});
	document.body.appendChild(area);

	area.focus({ preventScroll: true });
	area.select();
	area.setSelectionRange(0, area.value.length);

	let ok = false;
	try {
		ok = document.execCommand("copy");
	} catch {
		ok = false;
	}

	area.remove();

	if (selection) {
		selection.removeAllRanges();
		for (const range of savedRanges) {
			selection.addRange(range);
		}
	}

	return ok;
}
