/**
 * Profile utilities (pure, no reactivity).
 *
 * Invite codes are exactly 6 chars of A–Z / 0–9. Generated codes avoid
 * ambiguous chars, but a custom code may use any A–Z or 0–9.
 */
export const CUSTOM_INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

/** Validation message for an invite-code draft, or "" when valid. */
export function validateInviteCode(code: string): string {
	const normalized = code.trim().toUpperCase();
	if (!normalized) return "Invite code is required.";
	if (!CUSTOM_INVITE_CODE_PATTERN.test(normalized)) {
		return "Use exactly 6 letters or digits.";
	}
	return "";
}
