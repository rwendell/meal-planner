import { browser } from "$app/environment";
import { randomAnonName } from "$lib/anon-names.js";

export interface HouseholdSession {
	householdId: string;
	memberId: string;
}

export const STORAGE_KEY = "meal-planner-session";
const LOCK_KEY = "meal-planner-provisioning";
const DEVICE_NAME_KEY = "meal-planner-device-name";

// In-memory fallback so one page lifecycle never shows two different
// names even if storage throws partway through.
let memoryDeviceName: string | null = null;

/**
 * Stable per-browser anonymous display name ("Sunny Tomato"), generated
 * once and persisted. Used for auto-provisioned members and anywhere a
 * member name isn't loaded yet. Replaced by the OAuth profile name on
 * first sign-in link.
 */
export function deviceName(): string {
	if (!browser) return "Sunny Tomato";
	try {
		const stored = localStorage.getItem(DEVICE_NAME_KEY);
		if (stored?.trim()) return stored;
		memoryDeviceName ??= randomAnonName();
		localStorage.setItem(DEVICE_NAME_KEY, memoryDeviceName);
		return memoryDeviceName;
	} catch {
		memoryDeviceName ??= randomAnonName();
		return memoryDeviceName;
	}
}

export function readStoredSession(): HouseholdSession | null {
	return load();
}

export function provisioningLockAge(): number {
	if (!browser) return Number.POSITIVE_INFINITY;
	return Date.now() - Number(localStorage.getItem(LOCK_KEY) ?? 0);
}

export function setProvisioningLock(): void {
	if (browser) localStorage.setItem(LOCK_KEY, String(Date.now()));
}

export function clearProvisioningLock(): void {
	if (browser) localStorage.removeItem(LOCK_KEY);
}

function load(): HouseholdSession | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<HouseholdSession>;
		if (
			typeof parsed.householdId === "string" &&
			typeof parsed.memberId === "string"
		) {
			return { householdId: parsed.householdId, memberId: parsed.memberId };
		}
		return null;
	} catch {
		return null;
	}
}

class SessionStore {
	session = $state<HouseholdSession | null>(load());

	reload(): void {
		this.session = load();
	}

	connect(session: HouseholdSession): void {
		this.session = session;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
		}
	}

	disconnect(): void {
		this.session = null;
		if (browser) {
			localStorage.removeItem(STORAGE_KEY);
		}
	}
}

export const session = new SessionStore();
