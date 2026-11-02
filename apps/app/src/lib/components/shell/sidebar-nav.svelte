<script lang="ts">
	import { page } from '$app/state';

	import { navGroups } from '$lib/nav';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	let { onNavigate }: { onNavigate?: () => void } = $props();
</script>

<nav class="flex flex-col gap-6 p-3" aria-label={t('nav.toggle_sidebar')}>
	{#each navGroups as group, index (index)}
		<div class="flex flex-col gap-1">
			{#if group.labelKey}
				<p class="text-muted-foreground px-3 pb-1 text-xs font-medium">
					{t(group.labelKey)}
				</p>
			{/if}

			{#each group.items as item (item.href)}
				{@const active = page.url.pathname.startsWith(item.href)}
				{#if item.pending}
					<!-- Not navigable until its story lands, so the shell never
					     links into a 404. -->
					<span
						class="text-muted-foreground/60 flex items-center gap-3 rounded-md px-3 py-2 text-sm"
						aria-disabled="true"
					>
						<item.icon class="size-4 shrink-0" />
						<span class="truncate">{t(item.titleKey)}</span>
					</span>
				{:else}
					<a
						href={item.href}
						onclick={onNavigate}
						aria-current={active ? 'page' : undefined}
						class={cn(
							'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
							'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
							active && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
						)}
					>
						<item.icon class="size-4 shrink-0" />
						<span class="truncate">{t(item.titleKey)}</span>
					</a>
				{/if}
			{/each}
		</div>
	{/each}
</nav>
