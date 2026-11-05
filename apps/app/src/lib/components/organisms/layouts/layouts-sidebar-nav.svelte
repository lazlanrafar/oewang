<script lang="ts">
	/**
	 * Measured against the live app at app.oewang.com, not guessed: group
	 * label 30 high (`h-8`), 11.25px, weight 500, `sidebar-foreground/70`;
	 * 3.75px between items and 7.5px between groups; the list padded
	 * `px-2 pb-2`. The row itself, and its active hatch, is
	 * `layouts-sidebar-item`, which the settings sidebar shares.
	 */
	import { page } from '$app/state';

	import { navGroups } from '$lib/nav';
	import { t } from '$lib/i18n';

	import SidebarItem from './layouts-sidebar-item.svelte';

	let {
		collapsed = false,
		onNavigate
	}: { collapsed?: boolean; onNavigate?: () => void } = $props();
</script>

<nav class="flex flex-col gap-2 px-2 pb-2" aria-label={t('nav.toggle_sidebar')}>
	{#each navGroups as group, index (index)}
		<div class="flex flex-col gap-1">
			{#if group.labelKey && !collapsed}
				<p class="text-sidebar-foreground/70 flex h-8 shrink-0 items-center px-2 text-xs font-medium">
					{t(group.labelKey)}
				</p>
			{:else if group.labelKey}
				<!-- The rail keeps the grouping as a rule rather than a word. -->
				<div class="bg-sidebar-border mx-2 mb-1 h-px" aria-hidden="true"></div>
			{/if}

			{#each group.items as item (item.href)}
				<SidebarItem
					href={item.href}
					title={t(item.titleKey)}
					icon={item.icon}
					active={page.url.pathname.startsWith(item.href)}
					pending={item.pending}
					{collapsed}
					{onNavigate}
				/>
			{/each}
		</div>
	{/each}
</nav>
