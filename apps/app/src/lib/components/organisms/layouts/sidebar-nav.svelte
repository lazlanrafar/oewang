<script lang="ts">
	/**
	 * Measured against the live app at app.oewang.com, not guessed. Read off
	 * it with `getComputedStyle`: item 34 high (`h-9` at a 15px root), 7.5px
	 * of padding and gap, 13.125px text, square, active at
	 * `rgb(241, 240, 238)` and weight 500 against 400; group label 30 high
	 * (`h-8`), 11.25px, weight 500, `sidebar-foreground/70`; 3.75px between
	 * items and 7.5px between groups; the list padded `px-2 pb-2`.
	 *
	 * The active row is not just a grey fill. `SidebarMenuButton` in the old
	 * `packages/ui/src/components/atoms/sidebar.tsx` gives it a 2px left
	 * border, the accent fill, weight 500, and a 45 degree hatch drawn with
	 * `--chart-pattern-stroke` at 5 percent. Copied exactly, because the
	 * hatch is what makes it read as the current page rather than as a
	 * hovered one: a hovered row is the same fill at half strength.
	 *
	 * The hatch is written out in the markup rather than held in a constant,
	 * because Tailwind reads the source for class names and never sees one
	 * that is assembled at runtime.
	 */
	import { page } from '$app/state';

	import { navGroups } from '$lib/nav';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

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
				{@const active = page.url.pathname.startsWith(item.href)}
				{#if item.pending}
					<!-- Not navigable until its story lands, so the shell never
					     links into a 404. -->
					<span
						class={cn(
							'text-sidebar-foreground/50 flex h-9 items-center gap-2 border-l-2 border-transparent px-2 text-sm',
							collapsed && 'justify-center px-0'
						)}
						aria-disabled="true"
						title={collapsed ? t(item.titleKey) : undefined}
					>
						<item.icon class="size-4 shrink-0" />
						{#if collapsed}
							<span class="sr-only">{t(item.titleKey)}</span>
						{:else}
							<span class="truncate">{t(item.titleKey)}</span>
						{/if}
					</span>
				{:else}
					<a
						href={item.href}
						onclick={onNavigate}
						aria-current={active ? 'page' : undefined}
						title={collapsed ? t(item.titleKey) : undefined}
						class={cn(
							'flex h-9 items-center gap-2 border-l-2 border-transparent px-2 text-sm transition-colors',
							'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
							active &&
								'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent font-medium [background-image:repeating-linear-gradient(45deg,transparent_0_5px,color-mix(in_srgb,var(--chart-pattern-stroke)_5%,transparent)_5px_6px)]',
							collapsed && 'justify-center px-0'
						)}
					>
						<item.icon class="size-4 shrink-0" />
						{#if collapsed}
							<span class="sr-only">{t(item.titleKey)}</span>
						{:else}
							<span class="truncate">{t(item.titleKey)}</span>
						{/if}
					</a>
				{/if}
			{/each}
		</div>
	{/each}
</nav>
