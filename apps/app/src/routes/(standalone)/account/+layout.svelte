<script lang="ts">
	/**
	 * The account area, outside the app shell (D94): what a person changes
	 * about themselves, which belongs to no workspace.
	 *
	 * Laid out as the settings page is (D82), so the two read as one family:
	 * the sidebar at a fifth of the width, the section beside it up to 3xl,
	 * stacking below `lg`. Above them, where the app's top bar would be, only
	 * a way back and the product's mark.
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	import { Logo } from '$lib/components/atoms/logo';
	import { SettingsSidebar } from '$lib/components/organisms/settings';
	import { t } from '$lib/i18n';
	import { accountNavGroups } from '$lib/nav';

	let { children } = $props();
</script>

<main class="bg-background mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 p-4 md:p-6">
	<div class="flex items-center justify-between">
		<a
			href="/overview"
			class="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-3" />
			{t('account.back')}
		</a>
		<div class="flex items-center gap-2">
			<Logo class="size-6" />
			<span class="font-serif text-lg tracking-tight">{t('account.title')}</span>
		</div>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-12">
		<aside class="shrink-0 lg:w-1/5">
			<SettingsSidebar groups={accountNavGroups} label={t('account.title')} />
		</aside>
		<div class="flex min-w-0 flex-1 flex-col lg:max-w-3xl">
			{@render children()}
		</div>
	</div>
</main>
