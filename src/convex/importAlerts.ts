import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

const resend = new Resend(components.resend, { testMode: false });

// Developer inbox for import diagnostics. One line to change it later.
const ALERT_FROM = "Meal Planner <onboarding@resend.dev>";
const ALERT_TO = "ryanjwendell@gmail.com";

/**
 * Report a failed recipe import. Fire-and-forget by design: enqueueing
 * never throws for downstream delivery issues (those surface as email
 * events with retries), and callers must still swallow errors so a
 * broken alert path can never break the meal flow. One email per URL
 * per day via idempotency key.
 */
export const reportImportFailure = mutation({
	args: {
		url: v.string(),
		error: v.string(),
		householdId: v.optional(v.id("households")),
	},
	handler: async (ctx, args) => {
		const day = new Date().toISOString().slice(0, 10);
		const lines = [
			`A recipe import failed in Meal Planner.`,
			``,
			`URL: ${args.url}`,
			`Error: ${args.error}`,
			`Household: ${args.householdId ?? "(unknown)"}`,
			`Time (UTC): ${new Date().toISOString()}`,
		];
		await resend.sendEmail(ctx, {
			from: ALERT_FROM,
			to: ALERT_TO,
			subject: `Meal Planner: recipe import failed`,
			text: lines.join("\n"),
			idempotencyKey: `import-failure:${day}:${args.url}`,
		});
		return null;
	},
	returns: v.null(),
});
