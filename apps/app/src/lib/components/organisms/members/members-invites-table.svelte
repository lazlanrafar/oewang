<script lang="ts">
	/**
	 * Invitations not yet accepted (WS-3): who, as what, until when, and a
	 * way to revoke one. Only an owner or an admin sees this table.
	 */
	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import * as Table from '$lib/components/atoms/table';
	import { t } from '$lib/i18n';
	import type { Invite } from '$lib/server/workspaces';
	import { roleLabel } from '$lib/workspaces';

	let {
		invites,
		empty,
		onRevoke
	}: {
		invites: Invite[];
		/** The empty row's text, which the page picks (UI-2). */
		empty: string;
		onRevoke?: (invite: Invite) => void;
	} = $props();

	const dates = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
</script>

<Table.Root aria-label={t('settings.members_tab_invites')}>
	<Table.Header>
		<Table.Row>
			<Table.Head class="text-xs">{t('settings.invites_col_email')}</Table.Head>
			<Table.Head class="w-28 text-xs">{t('settings.members_col_role')}</Table.Head>
			<Table.Head class="hidden w-32 text-xs sm:table-cell">
				{t('settings.invites_col_expires')}
			</Table.Head>
			<Table.Head class="w-24 text-right text-xs">
				<span class="sr-only">{t('common.actions')}</span>
			</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each invites as invite (invite.id)}
			<Table.Row>
				<Table.Cell class="truncate font-medium">{invite.email}</Table.Cell>
				<Table.Cell><Badge variant="outline">{roleLabel(invite.role)}</Badge></Table.Cell>
				<Table.Cell class="text-subtle hidden text-xs sm:table-cell">
					{dates.format(new Date(invite.expires_at))}
				</Table.Cell>
				<Table.Cell class="text-right">
					<Button variant="ghost-destructive" size="sm" onclick={() => onRevoke?.(invite)}>
						{t('settings.invites_revoke')}
					</Button>
				</Table.Cell>
			</Table.Row>
		{:else}
			<Table.Row>
				<Table.Cell colspan={4} class="text-subtle h-32 text-center text-xs">{empty}</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
