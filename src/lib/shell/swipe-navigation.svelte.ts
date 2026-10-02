import { MediaQuery } from "svelte/reactivity";
import { browser } from "$app/environment";
import { goto, onNavigate } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { swipeTarget } from "$lib/utils/nav.js";

/**
 * Horizontal swipe navigation between primary sections, for touch
 * devices. Desktop has a real nav menu, so swipes are ignored at >= lg.
 *
 * Owns the whole gesture: arming on pointerdown, axis locking on move,
 * threshold on release, the navigation itself, and the directional view
 * transition. The caller only has to wire four document-level pointer
 * handlers and mark interactive regions with `data-no-swipe`.
 *
 * Instantiate once per layout (`new SwipeNavigation()`).
 */
type ViewTransitionDocument = Document & {
	startViewTransition?: (updateCallback: () => void | Promise<void>) => {
		finished: Promise<unknown>;
	};
};

/** Below this width there is no nav menu, so swipe is the way to move. */
const MOBILE_MAX_WIDTH = 1024;
/** Minimum horizontal travel before a release counts as a swipe. */
const COMMIT_PX = 56;
/** Vertical travel must stay under this multiple of horizontal. */
const AXIS_RATIO = 1.2;
/** Early vertical lock: past this, the gesture is a scroll, not a swipe. */
const AXIS_LOCK_PX = 12;

const FOCUSABLE_INTERACTIVE = [
	"a",
	"button",
	"input",
	"select",
	"textarea",
	"label",
	'[contenteditable]:not([contenteditable="false"])',
	'[role="dialog"]',
	"dialog",
	"[data-no-swipe]",
].join(", ");

/** Overlays own their own gestures; a swipe behind one is never intended. */
const OVERLAY_SELECTOR = [
	'[data-slot="dialog-content"]',
	'[data-slot="popover-content"]',
	'[data-slot="alert-dialog-content"]',
].join(", ");

export class SwipeNavigation {
	private start = $state<{
		pointerId: number;
		x: number;
		y: number;
	} | null>(null);
	private navigating = false;

	/** -1 previous, 0 none, 1 next. Drives the view-transition direction. */
	private direction = $state<-1 | 0 | 1>(0);
	private targetPath = $state<string | null>(null);

	private reducedMotion = new MediaQuery(
		"(prefers-reduced-motion: reduce)",
		false,
	);

	/** True while an overlay is open. */
	private blockedByOverlay(): boolean {
		if (typeof document === "undefined") return false;
		return Boolean(document.querySelector(OVERLAY_SELECTOR));
	}

	/** True for anything the user can meaningfully interact with. */
	private isInteractive(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return true;
		return Boolean(target.closest(FOCUSABLE_INTERACTIVE));
	}

	private clearTransition(): void {
		this.direction = 0;
		this.targetPath = null;
		if (browser) {
			delete document.documentElement.dataset.viewTransitionDirection;
		}
	}

	/**
	 * Drives the directional view transition for navigations this module
	 * initiated. Returns a promise for navigations it recognises so
	 * SvelteKit awaits the transition; everything else passes straight
	 * through.
	 *
	 * Call once during component initialization -- `onNavigate` registers
	 * a router-level hook and returns nothing, so this is not a disposer.
	 */
	attach(): void {
		onNavigate((navigation) => {
			const isOurs =
				this.direction !== 0 && this.targetPath === navigation.to?.url.pathname;
			if (!isOurs) {
				// A navigation we didn't start (link click, back button)
				// abandons any pending direction.
				if (this.direction !== 0) this.clearTransition();
				return;
			}

			if (this.reducedMotion.current) {
				this.clearTransition();
				return;
			}

			const doc = document as ViewTransitionDocument;
			if (!doc.startViewTransition) {
				this.clearTransition();
				return;
			}

			document.documentElement.dataset.viewTransitionDirection =
				this.direction === 1 ? "next" : "previous";

			return new Promise<void>((done) => {
				try {
					const transition = doc.startViewTransition?.(async () => {
						done();
						await navigation.complete;
					});
					if (transition) {
						void transition.finished.then(
							() => this.clearTransition(),
							() => this.clearTransition(),
						);
					} else {
						this.clearTransition();
						done();
					}
				} catch {
					this.clearTransition();
					done();
				}
			});
		});
	}

	onPointerdown(event: PointerEvent): void {
		if (
			window.innerWidth >= MOBILE_MAX_WIDTH ||
			!event.isPrimary ||
			this.blockedByOverlay() ||
			this.isInteractive(event.target)
		) {
			this.start = null;
			return;
		}
		this.start = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
		};
	}

	onPointermove(event: PointerEvent): void {
		if (!this.start || event.pointerId !== this.start.pointerId) return;
		const dx = event.clientX - this.start.x;
		const dy = event.clientY - this.start.y;
		// Vertical intent wins early: once it's clearly a scroll, stop
		// tracking so the release doesn't fire a swipe.
		if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > AXIS_LOCK_PX) {
			this.start = null;
		}
	}

	async onPointerup(event: PointerEvent): Promise<void> {
		if (!this.start || event.pointerId !== this.start.pointerId) return;
		const { x, y } = this.start;
		this.start = null;

		const dx = event.clientX - x;
		const dy = event.clientY - y;
		if (
			window.innerWidth >= MOBILE_MAX_WIDTH ||
			Math.abs(dx) < COMMIT_PX ||
			Math.abs(dx) <= Math.abs(dy) * AXIS_RATIO ||
			this.navigating
		) {
			return;
		}

		const direction = dx < 0 ? 1 : -1;
		const href = swipeTarget(page.url.pathname, direction);
		if (!href) return;

		const targetPath = new URL(resolve(href), window.location.href).pathname;
		this.direction = direction;
		this.targetPath = targetPath;
		this.navigating = true;
		try {
			await goto(resolve(href));
		} finally {
			this.navigating = false;
			if (page.url.pathname !== targetPath) this.clearTransition();
		}
	}

	onPointercancel(): void {
		this.start = null;
	}
}
