<script lang="ts">
	/**
	 * Members (WS-3, WS-4, D104), the old members page in a settings
	 * section: two tabs, members and invitations, each a list, with the
	 * filter bar on the left and the invite button on the right.
	 *
	 * Every write is a form action, so the list afterwards is what the
	 * server holds. The tab, the search and the role are in the URL (UI-8).
	 */
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import { tick } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		MembersInviteSheet,
		MembersInvitesTable,
		MembersTable
	} from '$lib/components/organisms/members';
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { Invite, Member } from '$lib/server/workspaces';
	import { readText, writeParams } from '$lib/url-state';
	import { roleLabel, type WorkspaceRole } from '$lib/workspaces';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canManage = $derived(data.me.role !== 'member');
	const tab = $derived(canManage && readText(page.url, 'tab') === 'invites' ? 'invites' : 'members');

	const bar = filterBar({ role: 'role' });

	const ROLE_OPTIONS: { id: WorkspaceRole; name: string }[] = [
		{ id: 'owner', name: roleLabel('owner') },
		{ id: 'admin', name: roleLabel('admin') },
		{ id: 'member', name: roleLabel('member') }
	];

	function changeTab(next: string) {
		if (next === tab) return;
		// Each tab has its own filters; carrying a role over to the
		// invitations would filter by something that tab does not show.
		writeParams({ tab: next === 'invites' ? 'invites' : null, search: null, role: null });
	}

	// --------------------------------------------------------------- invite

	let inviteOpen = $state(false);
	let saving = $state(false);
	let sent = $state<{ email: string; link: string } | null>(null);

	function openInvite() {
		sent = null;
		inviteOpen = true;
	}

	const inviteSubmit: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success' && result.data?.link) {
				sent = { email: String(result.data.invited), link: String(result.data.link) };
			}
			await update({ reset: false, navigate: false });
		};
	};
	const inviteAction = (node: HTMLFormElement) => enhance(node, inviteSubmit);

	// ------------------------------------------- role, remove and revoke

	let actionForm = $state<HTMLFormElement | null>(null);
	let pending = $state<{ action: string; fields: Record<string, string>; done: string }>({
		action: '',
		fields: {},
		done: ''
	});

	async function submit(action: string, fields: Record<string, string>, done: string) {
		pending = { action, fields, done };
		await tick();
		actionForm?.requestSubmit();
	}

	let removing = $state<Member | null>(null);
	let confirmRemove = $state(false);
	let revoking = $state<Invite | null>(null);
	let confirmRevoke = $state(false);

	function changeRole(member: Member, role: WorkspaceRole) {
		submit('role', { user_id: member.user_id, role }, t('settings.members_role_changed'));
	}
</script>

<svelte:head>
	<title>{pageTitle(t('settings.members_title'), t('settings.title'))}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader
		title={t('settings.members_title')}
		description={t('settings.members_description')}
	/>

	{#if !canManage}
		<p class="text-subtle text-small">{t('settings.members_read_only')}</p>
	{/if}

	<FormError message={form?.code && !inviteOpen ? messageForCode(form.code) : undefined} />

	<div class="flex flex-col gap-4">
		{#if canManage}
			<!-- Manual: focus coming back to a trigger, as it does when a dialog
			     closes, must not switch the tab and drop its filters. -->
			<Tabs.Root value={tab} onValueChange={changeTab} activationMode="manual">
				<Tabs.List>
					<Tabs.Trigger value="members">{t('settings.members_tab_members')}</Tabs.Trigger>
					<Tabs.Trigger value="invites">{t('settings.members_tab_invites')}</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		{/if}

		<div class="flex items-center justify-between gap-4">
			<div class="flex flex-1 items-center">
				<DataTableFilter
					bind:filters={bar.filters}
					facets={tab === 'members'
						? [{ id: 'role', label: t('settings.members_col_role'), options: ROLE_OPTIONS }]
						: []}
					placeholder={tab === 'members'
						? t('settings.members_search')
						: t('settings.invites_search')}
					showAmount={false}
					showDate={false}
					class="w-full"
				/>
			</div>
			{#if canManage}
				<Button onclick={openInvite}>
					<UserPlus />
					{t('settings.members_invite')}
				</Button>
			{/if}
		</div>

		{#if tab === 'members'}
			<MembersTable
				members={data.members}
				viewerId={data.me.user.id}
				viewerRole={data.me.role}
				empty={t('settings.members_empty_filtered')}
				onRoleChange={changeRole}
				onRemove={(member) => {
					removing = member;
					confirmRemove = true;
				}}
			/>
		{:else}
			<MembersInvitesTable
				invites={data.invites}
				empty={data.filtered ? t('settings.invites_empty_filtered') : t('settings.invites_empty')}
				onRevoke={(invite) => {
					revoking = invite;
					confirmRevoke = true;
				}}
			/>
		{/if}
	</div>
</div>

<!-- Hidden: the menus and dialogs are what the reader answers, and this is
     how the answer reaches the server as an ordinary form action. -->
<form
	bind:this={actionForm}
	method="POST"
	action="?/{pending.action}"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') toast.success(pending.done);
		await update({ navigate: false });
	}}
>
	{#each Object.entries(pending.fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
</form>

<MembersInviteSheet
	bind:open={inviteOpen}
	viewerRole={data.me.role}
	{saving}
	{sent}
	fieldErrors={form?.fields}
	enhance={inviteAction}
/>

<ConfirmDialog
	bind:open={confirmRemove}
	title={t('settings.members_remove_title')}
	description={t('settings.members_remove_confirm', {
		name: removing?.name || removing?.email || ''
	})}
	confirmLabel={t('settings.members_remove')}
	cancelLabel={t('common.cancel')}
	onConfirm={() =>
		removing &&
		submit('remove', { user_id: removing.user_id }, t('settings.members_removed'))}
/>

<ConfirmDialog
	bind:open={confirmRevoke}
	title={t('settings.invites_revoke_title')}
	description={t('settings.invites_revoke_confirm', { email: revoking?.email ?? '' })}
	confirmLabel={t('settings.invites_revoke')}
	cancelLabel={t('common.cancel')}
	onConfirm={() =>
		revoking && submit('revoke', { id: revoking.id }, t('settings.invites_revoked'))}
/>
