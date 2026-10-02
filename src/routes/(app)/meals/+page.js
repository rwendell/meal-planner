import { redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";

/** The meal collection moved from /meals to /cookbook. */
export function load() {
	throw redirect(301, resolve("/cookbook"));
}
