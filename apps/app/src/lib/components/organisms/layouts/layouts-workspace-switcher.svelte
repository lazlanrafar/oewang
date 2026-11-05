<script lang="ts">
	/**
	 * The block at the top of the sidebar.
	 *
	 * Measured against the live app: h-12, px-2, a 30px avatar with a 0.25rem
	 * radius, the workspace name above a secondary line.
	 *
	 * Not a switcher yet. Switching workspace is `POST /v1/auth/switch-workspace`
	 * and lands with the workspace picker; until then this renders the current
	 * workspace rather than pretending to be a menu that does nothing.
	 */
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	let {
		name,
		secondary,
		collapsed = false
	}: { name: string; secondary: string; collapsed?: boolean } = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<div class={cn('flex h-12 items-center gap-2 px-2', collapsed && 'justify-center px-0')}>
	<!-- The one place the live app uses a radius; everything else is square. -->
	<div
		class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-none text-xs font-medium"
		title={collapsed ? name : undefined}
		aria-hidden="true"
	>
		{initials}
	</div>
	{#if !collapsed}
		<div class="min-w-0 flex-1 leading-tight">
			<p class="truncate text-sm font-medium">{name}</p>
			<p class="text-muted-foreground truncate text-xs">{secondary}</p>
		</div>
	{/if}
	<span class="sr-only">{t('shell.workspace')}: {name}</span>
</div>
