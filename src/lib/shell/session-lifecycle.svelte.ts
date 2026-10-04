import { type UseQueryReturn, useMutation, useQuery } from "convex-svelte";
import { browser } from "$app/environment";
import {
	clearProvisioningLock,
	deviceName,
	provisioningLockAge,
	STORAGE_KEY,
	session,
	setProvisioningLock,
} from "$lib/stores/session.svelte.js";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Decides which household the session points at, and keeps that decision
 * current: join an existing membership, provision a first household, claim
 * the member row to the sign-in, and reset when the linked household is
 * gone.
 *
 * Single household per user, so there is no roster and nothing to switch
 * between. The session reference is the whole story; everything else here
 * derives from it.
 *
 * The caller owns `signedOut`. Sign-out must stop every effect below for
 * the rest of the page lifecycle, and that flag lives with the sign-in
 * button that sets it. Pass a getter rather than a snapshot so the effects
 * always read the current value.
 *
 * Instantiate once during component init -- `useQuery`/`useMutation` need
 * component context, so this cannot be a module-level singleton.
 */
export class SessionLifecycle {
	private createHousehold = useMutation(api.householdLifecycle.create);
	private claimHouseholds = useMutation(api.householdIdentity.claimHouseholds);

	// Created in the constructor body, not as field initializers: useQuery
	// evaluates its args eagerly and constructor parameter properties aren't
	// assigned until the constructor body runs.
	private membershipsQuery!: UseQueryReturn<
		typeof api.householdIdentity.myMemberships
	>;
	private householdQuery!: UseQueryReturn<typeof api.householdLifecycle.get>;

	/**
	 * @param auth Sign-in status, read live. `isLoading` gates
	 *   provisioning; `isAuthenticated` decides whether an existing
	 *   membership is adopted or a new household is created. Pass the auth
	 *   object itself rather than copying its flags: `isLoading` and
	 *   `isAuthenticated` are getters over reactive state, so a snapshot
	 *   would freeze them and the effects below would never re-run.
	 * @param isSignedOut Returns true once the user has signed out. Blocks
	 *   every effect for the rest of the page.
	 */
	constructor(
		private auth: {
			readonly isLoading: boolean;
			readonly isAuthenticated: boolean;
		},
		private isSignedOut: () => boolean,
	) {
		this.membershipsQuery = useQuery(api.householdIdentity.myMemberships, () =>
			!auth.isLoading && auth.isAuthenticated ? {} : "skip",
		);
		this.householdQuery = useQuery(api.householdLifecycle.get, () => {
			const current = session.session;
			return current
				? {
						householdId: current.householdId as Id<"households">,
						callerMemberId: current.memberId as Id<"householdMembers">,
					}
				: "skip";
		});

		$effect(() => this.adoptMembership());
		$effect(() => this.claimMemberRow());
		$effect(() => {
			this.provisionIfNeeded();
		});
		$effect(() => this.resetIfHouseholdGone());
	}

	/** Members of the session household, or null while signed out. */
	get members() {
		return this.householdQuery.data?.members ?? null;
	}

	/**
	 * The session household, or null while signed out.
	 *
	 * `inviteCode` is already withheld server-side for callers who may not
	 * see it: owners always get it, members only when the household allows
	 * member invites. Consumers must treat it as optional and simply omit
	 * their invite UI when it is absent.
	 */
	get household() {
		return this.householdQuery.data?.household ?? null;
	}

	/** True while the session household is still loading. */
	get loading() {
		return this.householdQuery.data === undefined;
	}

	/** True when the household query failed (offline, or a bad session id). */
	get error() {
		return this.householdQuery.error !== undefined;
	}

	/**
	 * A signed-in user on a new device joins their first membership rather
	 * than provisioning a duplicate solo kitchen. Anonymous visitors have
	 * no memberships to adopt.
	 */
	private adoptMembership(): void {
		if (session.session || this.isSignedOut()) return;
		if (this.auth.isLoading) return;
		if (this.auth.isAuthenticated) {
			if (this.membershipsQuery.data === undefined) return;
			const first = this.membershipsQuery.data[0];
			if (first) {
				session.connect({
					householdId: first.householdId,
					memberId: first.memberId,
				});
			}
		}
	}

	/**
	 * Claiming links the session member row to the sign-in and backfills
	 * portable meals/skips. One attempt per session identity.
	 *
	 * Plain `let` rather than $state: no effect reads these, so they need
	 * no reactivity.
	 */
	private claimAttempts = 0;
	private claimKey: string | null = null;

	/**
	 * Bounded retries for a claim that fails or hits a stale token. Token
	 * propagation settles in seconds, so a few backed-off attempts cover
	 * it without hammering the server forever. The server reports a stale
	 * token explicitly (signedIn: false) rather than throwing.
	 */
	private scheduleClaimRetry(): void {
		const delays = [3000, 7000, 15000, 30000];
		if (this.claimAttempts >= delays.length) return;
		const delay = delays[this.claimAttempts] ?? 30000;
		this.claimAttempts += 1;
		setTimeout(() => {
			this.claimKey = null;
		}, delay);
	}

	private claimMemberRow(): void {
		if (!this.auth.isAuthenticated || this.isSignedOut()) return;
		const current = session.session;
		if (!current) return;
		const key = `${current.householdId}:${current.memberId}`;
		if (this.claimKey === key) return;
		this.claimKey = key;
		this.claimHouseholds({
			refs: [
				{
					householdId: current.householdId as Id<"households">,
					memberId: current.memberId as Id<"householdMembers">,
				},
			],
		}).then(
			(result) => {
				if (!result.signedIn) this.scheduleClaimRetry();
			},
			() => this.scheduleClaimRetry(),
		);
	}

	/**
	 * First visit lands straight in the planner with a personal household;
	 * a linked-but-deleted household resets the same way.
	 *
	 * A lock plus a storage listener stops two tabs opened at once from
	 * each provisioning. A tab that finds a fresh lock waits for the other
	 * to finish, then retries.
	 */
	private provisionTick = $state(0);

	private provisionIfNeeded(): (() => void) | undefined {
		this.provisionTick;
		if (!browser || session.session || this.isSignedOut()) return;
		// Wait for auth to resolve: anonymous visitors provision as
		// before, but signed-in users without memberships provision only
		// once adoptMembership has had its chance.
		if (this.auth.isLoading) return;
		if (this.auth.isAuthenticated && this.membershipsQuery.data === undefined) {
			return;
		}

		const onStorage = (event: StorageEvent) => {
			if (event.key === STORAGE_KEY) session.reload();
		};
		window.addEventListener("storage", onStorage);

		let timer: ReturnType<typeof setTimeout> | undefined;
		if (provisioningLockAge() < 30000) {
			// Another tab is provisioning. Wait, then drop the stale lock
			// and re-run so the storage event has landed by then.
			timer = setTimeout(() => {
				clearProvisioningLock();
				this.provisionTick += 1;
			}, 3000);
		} else {
			setProvisioningLock();
			this.createHousehold({
				memberName: deviceName(),
				autoNamed: true,
			})
				.then((result) => {
					session.connect({
						householdId: result.householdId,
						memberId: result.memberId,
					});
				})
				.catch(() => {})
				.finally(() => {
					clearProvisioningLock();
				});
		}

		return () => {
			window.removeEventListener("storage", onStorage);
			if (timer) clearTimeout(timer);
		};
	}

	private resetIfHouseholdGone(): void {
		if (session.session && this.householdQuery.data === null) {
			// Linked household was deleted: disconnect so provisioning
			// provisions a fresh one.
			session.disconnect();
		}
	}
}
