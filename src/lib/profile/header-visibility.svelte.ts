import { browser } from "$app/environment";

/**
 * Tracks whether the profile header row is on screen so the page shows
 * one EditActions set at a time: top buttons while the header is
 * visible, otherwise the bottom set takes over.
 *
 * Usage: `<div {@attach (el) => header.attach(el)} class="...">` then
 * read `header.visible`. The header row is always rendered, so
 * observing it is stable. Instantiate per page (`new HeaderVisibility()`)
 * — attachments must set up during component initialization.
 */
export class HeaderVisibility {
	visible = $state(true);

	attach(element: HTMLDivElement): () => void {
		if (!browser) return () => {};
		const observer = new IntersectionObserver(
			(entries) => {
				this.visible = entries[0]?.isIntersecting ?? true;
			},
			{ threshold: 0 },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}
}
