<script lang="ts">
	import UserRoundIcon from "@lucide/svelte/icons/user-round";
	import { resolve } from "$app/paths";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
</script>

<!--
  Empty state for signed-out / household-less visitors.
  `Empty` is the design-system empty-state primitive (namespace import:
  Root, Header, Media, Title, Description, Content) — the icon +
  message + call-to-action block used when there is nothing to show.
-->
<Empty.Root>
	<Empty.Header>
		<Empty.Media><UserRoundIcon /></Empty.Media>
		<Empty.Title>No household yet</Empty.Title>
		<Empty.Description>
			You need an active household to view your profile.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button href={resolve("/")}>Go home</Button>
	</Empty.Content>
</Empty.Root>
