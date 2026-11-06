<script lang="ts">
	/**
	 * The old `AuthSync` loading screen. The load above always redirects, so
	 * this shows only while that answer is on its way.
	 */
	import Loader2 from '@lucide/svelte/icons/loader-circle';

	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
</script>

<svelte:head><title>{pageTitle(t('onboarding.sync_title'))}</title></svelte:head>

<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]">
	<div class="flex min-h-[400px] flex-col items-center justify-center space-y-4 p-6 text-center">
		<Loader2 class="text-primary h-10 w-10 animate-spin" />
		<p class="text-muted-foreground text-sm">{t('onboarding.redirecting')}</p>
	</div>
</div>
