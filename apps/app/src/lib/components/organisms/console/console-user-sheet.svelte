<script lang="ts">
	/**
	 * One user, as an operator sees them (CSL-3, US-081): the account's
	 * metadata and every workspace they belong to, each linking to that
	 * workspace's sheet. Nothing about their money (CSL-13).
	 *
	 * Opened through `?user=`, so a workspace's member list can link here.
	 * Disable and enable (US-082) are offered by the page, which owns the
	 * confirmation and the form.
	 */
	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { formatCount, formatDay, type UserAction } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleUser, MemberRole } from '$lib/server/console';

	let {
		open = false,
		onOpenChange,
		user,
		actions = [],
		busy = null,
		onAction
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		user: ConsoleUser | null;
		/** What this operator may do to this user, in the order to show. */
		actions?: UserAction[];
		/** The action on its way, which shows as loading. */
		busy?: UserAction | null;
		onAction?: (action: UserAction) => void;
	} = $props();

	const ROLE: Record<MemberRole, string> = {
		owner: t('workspaces.role_owner'),
		admin: t('workspaces.role_admin'),
		member: t('workspaces.role_member')
	};

	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root {open} {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		{#if user}
			<Sheet.Header
				class="bg-muted/5 flex shrink-0 flex-row items-center justify-between gap-4 space-y-0 border-b p-6 text-left"
			>
				<div class="min-w-0 space-y-1">
					<Sheet.Title class="truncate font-serif text-xl font-normal">{user.email}</Sheet.Title>
					<Sheet.Description class="text-muted-foreground text-xs tracking-widest uppercase">
						{user.name ?? t('console.users.sheet.no_name')}
					</Sheet.Description>
				</div>
				{#if actions.length > 0}
					<div class="flex shrink-0 items-center gap-2">
						{#each actions as action (action)}
							<Button
								variant="outline"
								size="caps"
								loading={busy === action}
								disabled={busy !== null}
								onclick={() => onAction?.(action)}
							>
								{t(`console.actions.${action}.button` as const)}
							</Button>
						{/each}
					</div>
				{/if}
			</Sheet.Header>

			<div class="no-scrollbar flex-1 overflow-y-auto">
				<dl class="border-border/50 bg-muted/5 grid grid-cols-2 gap-6 border-b p-6">
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.users.sheet.status')}</dt>
						<dd class="text-sm tabular-nums">
							{#if user.disabled_at}
								<Badge variant="destructive">{t('console.users.disabled')}</Badge>
								<span class="text-muted-foreground ml-1 text-xs">{formatDay(user.disabled_at)}</span>
							{:else}
								{t('console.users.sheet.active')}
							{/if}
						</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.users.sheet.joined')}</dt>
						<dd class="text-sm tabular-nums">{formatDay(user.created_at)}</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.users.sheet.last_active')}</dt>
						<dd class="text-sm tabular-nums">
							{user.last_active_at ? formatDay(user.last_active_at) : t('console.never')}
						</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.users.sheet.console_role')}</dt>
						<dd class="text-sm">
							{#if user.console_role}
								<Badge variant="outline">{user.console_role}</Badge>
							{:else}
								{t('console.users.sheet.no_console_role')}
							{/if}
						</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.users.sheet.workspaces')}</dt>
						<dd class="text-sm tabular-nums">{formatCount(user.workspaces)}</dd>
					</div>
				</dl>

				<section class="space-y-3 p-6">
					<h3 class={capsLabel}>{t('console.users.sheet.memberships')}</h3>
					{#each user.memberships as membership (membership.workspace_id)}
						<a
							href="/console/workspaces?workspace={encodeURIComponent(membership.workspace_id)}"
							class="border-border/50 hover:bg-muted/30 flex items-center justify-between gap-3 border p-3 transition-colors"
						>
							<div class="min-w-0 space-y-0.5">
								<p class="truncate text-sm font-medium">{membership.workspace_name}</p>
								<p class="text-muted-foreground text-[11px] tabular-nums">
									{ROLE[membership.role]} · {formatDay(membership.joined_at)}
								</p>
							</div>
							{#if membership.workspace_deleted_at}
								<Badge variant="destructive">{t('console.users.sheet.deleted')}</Badge>
							{/if}
						</a>
					{:else}
						<p class="text-muted-foreground text-sm">{t('console.users.sheet.no_memberships')}</p>
					{/each}
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
