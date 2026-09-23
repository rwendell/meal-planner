<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";

	interface Props {
		visible: boolean;
		needsReview: boolean;
		onDismiss: () => void;
		onOpen: () => void;
	}

	let { visible, needsReview, onDismiss, onOpen }: Props = $props();
</script>

{#if visible}
	{#if needsReview}
		<Card.Root>
			<Card.Content>
				<div class="flex flex-wrap items-center gap-3">
					<div class="min-w-0 flex-1">
						<p class="m-0 text-sm font-semibold">
							Review last week for leftovers?
						</p>
						<p class="m-0 text-xs text-muted-foreground">
							Anything still around gets marked ready in one pass.
						</p>
					</div>
					<div class="flex shrink-0 gap-2">
						<Button variant="ghost" size="sm" onclick={onDismiss}>
							Not now
						</Button>
						<Button size="sm" onclick={onOpen}>Review</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="flex justify-end">
			<Button variant="ghost" size="sm" onclick={onOpen}>
				Review last week
			</Button>
		</div>
	{/if}
{/if}
