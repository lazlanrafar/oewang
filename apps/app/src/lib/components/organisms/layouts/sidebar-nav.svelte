<script lang="ts">
	/**
	 * Measured against the live app at app.oewang.com, not guessed:
	 * item h-9, px-2, gap-2, text-sm, square, active background
	 * `sidebar-accent`; group label text-xs, font-medium, foreground/70, px-2.
	 */
	import { page } from '$app/state';

	import { navGroups } from '$lib/nav';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	let { onNavigate }: { onNavigate?: () => void } = $props();
</script>

<nav class="flex flex-col gap-4 px-2 py-2" aria-label={t('nav.toggle_sidebar')}>
	{#each navGroups as group, index (index)}
		<div class="flex flex-col gap-0.5">
			{#if group.labelKey}
				<p class="text-foreground/70 px-2 pb-1 text-xs font-medium">
					{t(group.labelKey)}
				</p>
			{/if}

			{#each group.items as item (item.href)}
				{@const active = page.url.pathname.startsWith(item.href)}
				{#if item.pending}
					<!-- Not navigable until its story lands, so the shell never
					     links into a 404. -->
					<span
						class="text-sidebar-foreground/50 flex h-9 items-center gap-2 px-2 text-sm"
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
							'flex h-9 items-center gap-2 px-2 text-sm transition-colors',
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
