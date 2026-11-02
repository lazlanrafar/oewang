<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { mode, setMode, userPrefersMode } from 'mode-watcher';

	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';

	// Three states, not two: "system" has to stay reachable, or a user who
	// picks light can never hand the choice back to the OS.
	const order = ['light', 'dark', 'system'] as const;

	function next() {
		const current = userPrefersMode.current;
		const index = order.indexOf(current as (typeof order)[number]);
		setMode(order[(index + 1) % order.length]);
	}

	const label = $derived(
		userPrefersMode.current === 'system'
			? t('nav.theme_system')
			: mode.current === 'dark'
				? t('nav.theme_dark')
				: t('nav.theme_light')
	);
</script>

<Button
	variant="ghost"
	size="icon"
	class="size-8"
	onclick={next}
	aria-label={`${t('nav.toggle_theme')}: ${label}`}
	title={label}
>
	{#if userPrefersMode.current === 'system'}
		<Monitor class="size-4" />
	{:else if mode.current === 'dark'}
		<Moon class="size-4" />
	{:else}
		<Sun class="size-4" />
	{/if}
</Button>
