<script lang="ts">
	/**
	 * The workspace's members, as the old members page listed them: the
	 * initial, the name over the email, the role, and a row menu (WS-3).
	 *
	 * The menu changes a role or removes the member. It is offered only to
	 * someone who could do it: never on your own row, never to a member, and
	 * never on an owner's row unless you are an owner too. The API holds the
	 * same rules; hiding an action it would refuse is manners, not the
	 * control.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	import * as Avatar from '$lib/components/atoms/avatar';
	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import * as Table from '$lib/components/atoms/table';
	import { t } from '$lib/i18n';
	import type { Member } from '$lib/server/workspaces';
	import { roleLabel, workspaceInitial, type WorkspaceRole } from '$lib/workspaces';

	let {
		members,
		viewerId,
		viewerRole,
		empty,
		onRoleChange,
		onRemove
	}: {
		members: Member[];
		/** Who is looking, so their own row offers nothing. */
		viewerId: string;
		viewerRole: WorkspaceRole;
		/** The empty row's text, which the page picks (UI-2). */
		empty: string;
		onRoleChange?: (member: Member, role: WorkspaceRole) => void;
		onRemove?: (member: Member) => void;
	} = $props();

	const dates = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

	/** Roles the viewer may hand out: never above their own. */
	const grantable = $derived<WorkspaceRole[]>(
		viewerRole === 'owner' ? ['owner', 'admin', 'member'] : ['admin', 'member']
	);

	function canAct(member: Member): boolean {
		if (viewerRole === 'member' || member.user_id === viewerId) return false;
		return member.role !== 'owner' || viewerRole === 'owner';
	}

	const showActions = $derived(viewerRole !== 'member');
</script>

<Table.Root aria-label={t('settings.members_tab_members')}>
	<Table.Header>
		<Table.Row>
			<Table.Head class="text-xs">{t('settings.members_col_member')}</Table.Head>
			<Table.Head class="w-28 text-xs">{t('settings.members_col_role')}</Table.Head>
			<Table.Head class="hidden w-32 text-xs sm:table-cell">
				{t('settings.members_col_joined')}
			</Table.Head>
			{#if showActions}
				<Table.Head class="w-14 text-right text-xs">
					<span class="sr-only">{t('common.actions')}</span>
				</Table.Head>
			{/if}
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each members as member (member.user_id)}
			<Table.Row>
				<Table.Cell>
					<span class="flex min-w-0 items-center gap-3">
						<Avatar.Root class="size-8 shrink-0">
							<Avatar.Fallback>{workspaceInitial(member.name || member.email)}</Avatar.Fallback>
						</Avatar.Root>
						<span class="flex min-w-0 flex-col">
							<span class="truncate font-medium">
								{member.name || member.email}
								{#if member.user_id === viewerId}
									<span class="text-subtle font-normal">({t('settings.members_you')})</span>
								{/if}
							</span>
							{#if member.name}
								<span class="text-subtle truncate text-xs">{member.email}</span>
							{/if}
						</span>
					</span>
				</Table.Cell>
				<Table.Cell>
					<Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
						{roleLabel(member.role)}
					</Badge>
				</Table.Cell>
				<Table.Cell class="text-subtle hidden text-xs sm:table-cell">
					{dates.format(new Date(member.joined_at))}
				</Table.Cell>
				{#if showActions}
					<Table.Cell class="text-right">
						{#if canAct(member)}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											aria-label={t('common.actions')}
											{...props}
										>
											<Ellipsis />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="w-52">
									<DropdownMenu.Sub>
										<DropdownMenu.SubTrigger>{t('settings.members_change_role')}</DropdownMenu.SubTrigger>
										<DropdownMenu.SubContent>
											<DropdownMenu.RadioGroup value={member.role}>
												{#each grantable as role (role)}
													<DropdownMenu.RadioItem
														value={role}
														onSelect={() => role !== member.role && onRoleChange?.(member, role)}
													>
														{roleLabel(role)}
													</DropdownMenu.RadioItem>
												{/each}
											</DropdownMenu.RadioGroup>
										</DropdownMenu.SubContent>
									</DropdownMenu.Sub>
									<DropdownMenu.Separator />
									<DropdownMenu.Item class="text-destructive" onclick={() => onRemove?.(member)}>
										{t('settings.members_remove')}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
					</Table.Cell>
				{/if}
			</Table.Row>
		{:else}
			<Table.Row>
				<Table.Cell colspan={showActions ? 4 : 3} class="text-subtle h-32 text-center text-xs">
					{empty}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
