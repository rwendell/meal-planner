import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-svelte";
import { refKey, roster } from "$lib/stores/households.svelte.js";
import { deviceName, session } from "$lib/stores/session.svelte.js";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel";

export type RosterEntry = NonNullable<
	FunctionReturnType<typeof api.households.listHouseholds>[number]
>;

/**
 * Read-only roster state for the profile page: which kitchens exist and
 * which one is active. Owns the "drop dead roster entries" cleanup
 * effect. Household detail and everything editable live in
 * `ProfileEditor`, keyed off the viewed entry.
 *
 * Instantiate per page (`new RosterState()`) — queries must be created
 * during component initialization. Never destructure: read fields off
 * the instance so reactivity stays connected.
 */
export class RosterState {
	private rosterQuery = useQuery(api.households.listHouseholds, () =>
		roster.refs.length > 0
			? {
					refs: roster.refs.map((ref) => ({
						householdId: ref.householdId as Id<"households">,
						memberId: ref.memberId as Id<"householdMembers">,
					})),
				}
			: "skip",
	);

	entries = $derived(
		(this.rosterQuery.data ?? []).filter(
			(entry): entry is RosterEntry => entry !== null,
		),
	);
	rosterLoading = $derived(
		roster.refs.length > 0 && this.rosterQuery.data === undefined,
	);
	activeEntry = $derived(
		this.entries.find(
			(entry) =>
				entry.household._id === session.session?.householdId &&
				entry.member._id === session.session?.memberId,
		) ?? null,
	);
	myName = $derived(this.activeEntry?.member.name ?? deviceName());

	constructor() {
		// Drop roster entries the server no longer resolves (deleted households).
		$effect(() => {
			const data = this.rosterQuery.data;
			if (!data) return;
			const alive = new Set<string>();
			for (const entry of data) {
				if (entry) {
					alive.add(
						refKey({
							householdId: entry.household._id,
							memberId: entry.member._id,
						}),
					);
				}
			}
			roster.pruneToAlive(alive);
		});
	}
}
