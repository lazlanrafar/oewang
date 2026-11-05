<script lang="ts">
	/**
	 * The settings sidebar, as the old app's `SettingSidebar` lays it out:
	 * a flat first group, then labelled groups, every row the app sidebar's
	 * own row (D82). A section not built yet carries a "Soon" tag and no link.
	 *
	 * Active is an exact match, not a prefix: the sections are siblings, and
	 * `/settings/income-category` must not light up anything else.
	 */
	import { page } from '$app/state';

	import { SidebarItem } from '$lib/components/organisms/layouts';
	import { t } from '$lib/i18n';
	import { settingsNavGroups, type NavGroup } from '$lib/nav';
	import { cn } from '$lib/utils';

	/*
	 * The account area draws the same sidebar with its own groups (D94), so
	 * the two read as one family rather than as two hand-built lists.
	 */
	let {
		groups = settingsNavGroups,
		label = t('settings.title'),
		class: className
	}: { groups?: NavGroup[]; label?: string; class?: string } = $props();
</script>

<nav
	class={cn('flex flex-col gap-4 lg:gap-2', className)}
	aria-label={label}
>
	{#each groups as group, index (index)}
		<div class="flex flex-col gap-1">
			{#if group.labelKey}
				<p class="text-subtle flex h-8 shrink-0 items-center px-2 text-xs font-medium">
					{t(group.labelKey)}
				</p>
			{/if}
			{#each group.items as item (item.href)}
				<SidebarItem
					href={item.href}
					title={t(item.titleKey)}
					icon={item.icon}
					active={page.url.pathname === item.href}
					pending={item.pending}
					badge={item.pending ? t('settings.soon') : undefined}
				/>
			{/each}
		</div>
	{/each}
</nav>
