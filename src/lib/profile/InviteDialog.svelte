<script lang="ts">
	import LinkIcon from "@lucide/svelte/icons/link";
	import MailIcon from "@lucide/svelte/icons/mail";
	import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
	import ShareIcon from "@lucide/svelte/icons/share";
	import { toast } from "svelte-sonner";
	import { resolve } from "$app/paths";
	import InviteCode from "$lib/components/InviteCode.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Input } from "$lib/components/ui/input";
	import { copyText } from "$lib/utils/clipboard.js";

	let {
		open,
		code,
		onClose,
	}: {
		open: boolean;
		code: string;
		onClose: () => void;
	} = $props();

	let url = $state("");
	let qrSrc = $state<string | null>(null);
	let qrFor = $state<string | null>(null);
	let linkCopied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	// Runs only on open, so window is always available here and the QR
	// encoder never executes during prerender.
	$effect(() => {
		if (!open) return;
		url = new URL(`${resolve("/join")}?code=${code}`, window.location.href)
			.href;
		if (qrFor !== code) {
			qrFor = code;
			qrSrc = null;
			void makeQr(url);
		}
	});

	async function makeQr(target: string): Promise<void> {
		try {
			const QRCode = (await import("qrcode")).default;
			qrSrc = await QRCode.toDataURL(target, { width: 352, margin: 1 });
		} catch {
			// QR stays hidden; the link and code still work.
			qrSrc = null;
		}
	}

	async function copyLink(): Promise<void> {
		clearTimeout(copyTimer);
		const ok = await copyText(url);
		if (!ok) {
			toast.error("Copy was blocked by the browser");
			return;
		}
		linkCopied = true;
		copyTimer = setTimeout(() => {
			linkCopied = false;
		}, 2000);
	}

	/**
	 * One-tap share via the system sheet, falling back to copying the
	 * invite link. A dismissed sheet (AbortError) is silence, not an
	 * error: the user simply changed their mind.
	 */
	async function shareInvite(): Promise<void> {
		try {
			if (typeof navigator !== "undefined" && "share" in navigator) {
				await navigator.share({
					title: "Join my household on Meal Planner",
					text: "Join my household on Meal Planner:",
					url,
				});
				return;
			}
			throw new Error("no system share sheet");
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return;
			}
			await copyLink();
		}
	}

	const shareText = $derived(
		`Join my household on Meal Planner: ${url}`,
	);
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) onClose();
	}}
>
	<Dialog.Content
		data-no-swipe
		interactOutsideBehavior="ignore"
		class="sm:max-w-md"
	>
		<Dialog.Header>
			<Dialog.Title>Invite to household</Dialog.Title>
			<Dialog.Description>
				Anyone with the link or code can join.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<div class="flex items-start gap-4 overflow-x-auto py-1">
				<div class="grid w-16 shrink-0 justify-items-center gap-1.5">
					<Button
						size="icon-lg"
						variant="secondary"
						class="rounded-full"
						aria-label="Copy invite link"
						title="Copy invite link"
						onclick={() => void copyLink()}
					>
						<LinkIcon />
					</Button>
					<span class="text-[11px] text-muted-foreground">Copy</span>
				</div>
				<div class="grid w-16 shrink-0 justify-items-center gap-1.5">
					<Button
						size="icon-lg"
						variant="secondary"
						class="rounded-full"
						aria-label="Share invite link"
						title="Share invite link"
						onclick={() => void shareInvite()}
					>
						<ShareIcon />
					</Button>
					<span class="text-[11px] text-muted-foreground">Share</span>
				</div>
				<div class="grid w-16 shrink-0 justify-items-center gap-1.5">
					<Button
						href={`sms:?&body=${encodeURIComponent(shareText)}`}
						size="icon-lg"
						variant="secondary"
						class="rounded-full"
						aria-label="Invite by text message"
						title="Invite by text message"
					>
						<MessageCircleIcon />
					</Button>
					<span class="text-[11px] text-muted-foreground">Text</span>
				</div>
				<div class="grid w-16 shrink-0 justify-items-center gap-1.5">
					<Button
						href={`mailto:?subject=${encodeURIComponent("Join my household on Meal Planner")}&body=${encodeURIComponent(shareText)}`}
						size="icon-lg"
						variant="secondary"
						class="rounded-full"
						aria-label="Invite by email"
						title="Invite by email"
					>
						<MailIcon />
					</Button>
					<span class="text-[11px] text-muted-foreground">Email</span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Input
					readonly
					value={url}
					aria-label="Invite link"
					class="font-mono text-sm"
					onfocus={(event) => event.currentTarget.select()}
				/>
				<Button
					variant="outline"
					class="shrink-0"
					onclick={() => void copyLink()}
				>
					{linkCopied ? "Copied" : "Copy"}
				</Button>
			</div>
			<div class="flex justify-start">
				<InviteCode code={code} />
			</div>
			{#if qrSrc}
				<div class="grid justify-items-start gap-1.5">
					<img
						src={qrSrc}
						alt="QR code linking to this household's join page"
						class="aspect-square w-full max-w-44 rounded-lg border bg-white p-2"
					/>
					<span class="text-xs text-muted-foreground">
						Scan with your phone camera to join
					</span>
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
