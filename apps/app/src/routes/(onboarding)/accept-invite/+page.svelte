<script lang="ts">
	/**
	 * An invitation that could not be used. A usable one never renders this
	 * page: its load accepts it and moves on to the workspace.
	 */
	import { Button } from '$lib/components/atoms/button';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{pageTitle(t('invite.title'))}</title></svelte:head>

<div class="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-2">
	<h1 class="text-lg font-medium">{t('invite.invalid_title')}</h1>
	<p class="text-subtle text-sm">
		{data.error === 'missing'
			? t('invite.missing_body')
			: t('invite.invalid_body', { email: data.email ?? '' })}
	</p>
	<div>
		<Button href="/">{t('invite.home')}</Button>
	</div>
</div>
