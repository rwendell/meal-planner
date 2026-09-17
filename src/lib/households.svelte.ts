import { browser } from "$app/environment";
import { session } from "$lib/session.svelte.js";

export interface HouseholdRef {
	householdId: string;
	memberId: string;
}

const STORAGE_KEY = "meal-planner-households";

function refKey(ref: HouseholdRef): string {
	return `${ref.householdId}:${ref.memberId}`;
}

function parseStored(): HouseholdRef[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const seen = new Set<string>();
		const refs: HouseholdRef[] = [];
		for (const entry of parsed) {
			if (
				typeof entry !== "object" ||
				entry === null ||
				typeof (entry as Partial<HouseholdRef>).householdId !== "string" ||
				typeof (entry as Partial<HouseholdRef>).memberId !== "string"
			) {
				continue;
			}
			const ref = {
				householdId: (entry as HouseholdRef).householdId,
				memberId: (entry as HouseholdRef).memberId,
			};
			const key = refKey(ref);
			if (seen.has(key)) continue;
			seen.add(key);
			refs.push(ref);
		}
		return refs;
	} catch {
		return [];
	}
}

function load(): HouseholdRef[] {
	const refs = parseStored();
	// Adopt pre-roster sessions so existing users keep their kitchen.
	const current = session.session;
	if (
		current &&
		!refs.some(
			(ref) =>
				ref.householdId === current.householdId &&
				ref.memberId === current.memberId,
		)
	) {
		refs.unshift({
			householdId: current.householdId,
			memberId: current.memberId,
		});
	}
	return refs;
}

class HouseholdRoster {
	refs = $state<HouseholdRef[]>(load());

	private persist(): void {
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(this.refs));
			} catch {
				// Ignore storage failures; the in-memory roster still applies.
			}
		}
	}

	add(ref: HouseholdRef): void {
		this.refs = [
			ref,
			...this.refs.filter((existing) => refKey(existing) !== refKey(ref)),
		];
		this.persist();
	}

	/**
	 * Merge server-side memberships into the roster. Assigns at most
	 * once and only when something is actually missing — safe to call
	 * from an $effect that also reads the roster (unlike add(), which
	 * always rebuilds the array and self-triggers).
	 */
	mergeServerMemberships(mine: HouseholdRef[]): void {
		const seen = new Set(this.refs.map(refKey));
		const missing = mine.filter((ref) => !seen.has(refKey(ref)));
		if (missing.length === 0) return;
		this.refs = [...missing, ...this.refs];
		this.persist();
	}

	switchTo(ref: HouseholdRef): void {
		this.add(ref);
		session.connect(ref);
	}

	/**
	 * Forget a kitchen (e.g. after leaving). If it was the active one,
	 * fall through to the next known kitchen, otherwise disconnect.
	 */
	forget(householdId: string): void {
		this.refs = this.refs.filter((ref) => ref.householdId !== householdId);
		this.persist();
		if (session.session?.householdId === householdId) {
			const next = this.refs[0];
			if (next) {
				session.connect(next);
			} else {
				session.disconnect();
			}
		}
	}

	/** Drop roster entries the server no longer resolves (deleted kitchens). */
	pruneToAlive(alive: Set<string>): void {
		const pruned = this.refs.filter((ref) => alive.has(refKey(ref)));
		if (pruned.length !== this.refs.length) {
			this.refs = pruned;
			this.persist();
		}
	}
}

export const roster = new HouseholdRoster();
export { refKey };
