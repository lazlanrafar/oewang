<script lang="ts">
	/**
	 * The operator console (CSL, D124) in the app's own shell (`AppShell`):
	 * the same collapsible sidebar, header and scrolling content as the
	 * dashboard. The sidebar opens with the console's mark where the app has
	 * its workspace switcher, then the rows this operator's permissions show;
	 * the account menu names the operator and their role.
	 */
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	import { AccountMenu, AppShell, AppSidebar, SidebarBrand } from '$lib/components/organisms/layouts';
	import { t } from '$lib/i18n';
	import { consoleNavFor } from '$lib/nav';

	let { children, data } = $props();

	const groups = $derived(consoleNavFor(data.operator.permissions));
</script>

<AppShell sidebarOpen={data.sidebarOpen}>
	{#snippet sidebar(props)}
		<AppSidebar {groups} {...props}>
			{#snippet top(collapsed)}
				<SidebarBrand
					title={t('console.title')}
					subtitle={data.operator.role.name}
					icon={ShieldCheck}
					{collapsed}
				/>
			{/snippet}
		</AppSidebar>
	{/snippet}

	{#snippet account()}
		<AccountMenu
			name={data.operator.name}
			email={data.operator.email}
			photo={null}
			subtitle={data.operator.role.name}
			accountLinks={false}
		/>
	{/snippet}

	{@render children()}
</AppShell>
