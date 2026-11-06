<script lang="ts">
	// Ported from the old app's organisms/data-table/data-table-empty-state.
	import Plus from '@lucide/svelte/icons/plus';
	import type { Component } from 'svelte';

	import { Button } from '../../atoms/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		title,
		description,
		actionLabel,
		onAction,
		icon: Icon = Plus,
		class: className
	}: {
		title: string;
		description: string;
		actionLabel?: string;
		onAction?: () => void;
		/**
		 * The action's mark. A plus by default, for "add the first one"; the
		 * "nothing matching" state passes its own, because clearing a
		 * filter adds nothing.
		 */
		icon?: Component;
		class?: string;
	} = $props();
</script>

<div class={cn('flex flex-col items-center justify-center py-20 text-center', className)}>
	<h3 class="mb-2 font-serif text-xl font-medium tracking-tight">{title}</h3>
	<p class="text-subtle mb-8 max-w-[280px] text-sm">{description}</p>
	{#if actionLabel}
		<Button variant="outline" size="sm" onclick={onAction}>
			<Icon class="mr-2 h-4 w-4" />
			{actionLabel}
		</Button>
	{/if}
</div>
