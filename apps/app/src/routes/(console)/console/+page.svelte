<script lang="ts">
	/**
	 * The console's front page. For now it says who is signed in and what
	 * they may do; the overview figures arrive with US-084.
	 */
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	let { data } = $props();
</script>

<svelte:head><title>{pageTitle(t('console.nav_overview'))}</title></svelte:head>

<SettingsSectionHeader
	title={t('console.overview_title', { role: data.operator.role.name })}
	description={t('console.overview_description')}
/>

<ul class="mt-4 flex flex-col gap-1 text-sm">
	{#each data.operator.permissions as permission (permission)}
		<li class="text-muted-foreground font-mono text-xs">{permission}</li>
	{/each}
</ul>
