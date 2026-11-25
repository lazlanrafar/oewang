<script lang="ts">
	/**
	 * A sidebar's top row when it has no workspace to switch: the same 48px
	 * row and dark tile as the workspace switcher's trigger, with a title
	 * over a second line, and nothing to open. The console uses it.
	 */
	import type { Component } from 'svelte';

	import { cn } from '$lib/utils';

	let {
		title,
		subtitle,
		icon: Icon,
		collapsed = false
	}: {
		title: string;
		subtitle?: string;
		icon: Component<{ class?: string }>;
		collapsed?: boolean;
	} = $props();
</script>

<div class={cn('flex flex-col gap-2 p-2', collapsed && 'items-center px-0')}>
	<div
		class={cn('flex w-full items-center gap-2 overflow-hidden text-left text-sm', collapsed ? 'size-8 justify-center p-0' : 'h-12 p-2')}
		title={collapsed ? title : undefined}
	>
		<span
			class="flex aspect-square size-8 shrink-0 items-center justify-center rounded bg-foreground font-semibold text-background text-sm"
		>
			<Icon class="size-4" />
		</span>
		{#if !collapsed}
			<span class="grid flex-1 text-left text-sm leading-tight">
				<span class="truncate font-semibold">{title}</span>
				{#if subtitle}<span class="truncate text-xs">{subtitle}</span>{/if}
			</span>
		{/if}
	</div>
</div>
