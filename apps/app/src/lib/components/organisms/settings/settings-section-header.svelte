<script lang="ts">
	/**
	 * The top of a settings section, as the old app's sections open: a title,
	 * one line of what the section is for, and a rule.
	 *
	 * A settings section names itself, unlike a list screen (D81), because
	 * the settings sidebar is one level below the app sidebar and its row
	 * alone does not say what the page edits (D82).
	 */
	import { Separator } from '$lib/components/atoms/separator';

	let { title, description }: { title: string; description: string } = $props();
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-lg font-medium tracking-tight">{title}</h1>
		<p class="text-subtle text-xs">{description}</p>
	</div>
	<Separator />
</div>
