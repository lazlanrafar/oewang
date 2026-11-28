<script lang="ts">
	/**
	 * One workspace, as an operator sees it (CSL-4, US-081): its metadata,
	 * how much is in it (counts, storage and this month's tokens, never an
	 * amount, CSL-13), and its members, each linking to that user's sheet.
	 *
	 * Opened through `?workspace=`, so a user's membership list can link here.
	 * Suspend, unsuspend and restore (US-082) are offered by the page, which
	 * owns the confirmation and the form. So is the plan (OEW-131): given the
	 * plans, the sheet shows a picker posting to the page's `?/plan`.
	 */
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { SelectPlan } from '$lib/components/molecules/select-plan';
	import { formatCount, formatDay, type WorkspaceAction } from '$lib/console';
	import { formatBytes } from '$lib/files';
	import { t } from '$lib/i18n';
	import type { ConsoleWorkspace, MemberRole } from '$lib/server/console';

	import ConsoleWorkspaceStatusBadge from './console-workspace-status-badge.svelte';

	let {
		open = false,
		onOpenChange,
		workspace,
		actions = [],
		busy = null,
		onAction,
		plans = null,
		savingPlan = false,
		planEnhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		workspace: ConsoleWorkspace | null;
		/** What this operator may do to this workspace, in the order to show. */
		actions?: WorkspaceAction[];
		/** The action on its way, which shows as loading. */
		busy?: WorkspaceAction | null;
		onAction?: (action: WorkspaceAction) => void;
		/** The plans to choose from; null when this operator cannot assign one. */
		plans?: { id: string; name: string }[] | null;
		savingPlan?: boolean;
		/** The plan change, owned by the page. */
		planEnhance?: (node: HTMLFormElement) => void;
	} = $props();

	let planId = $state('');
	$effect(() => {
		planId = workspace?.plan_id ?? '';
	});
	const progressive = (node: HTMLFormElement) => planEnhance?.(node);

	const ROLE: Record<MemberRole, string> = {
		owner: t('workspaces.role_owner'),
		admin: t('workspaces.role_admin'),
		member: t('workspaces.role_member')
	};

	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root {open} {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		{#if workspace}
			<Sheet.Header
				class="bg-muted/5 flex shrink-0 flex-row items-center justify-between gap-4 space-y-0 border-b p-6 text-left"
			>
				<div class="min-w-0 space-y-1">
					<Sheet.Title class="truncate font-serif text-xl font-normal">{workspace.name}</Sheet.Title>
					<Sheet.Description class="text-muted-foreground text-xs tracking-widest uppercase">
						{workspace.owner_email ?? t('console.workspaces.sheet.no_owner')}
					</Sheet.Description>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<ConsoleWorkspaceStatusBadge {workspace} />
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
			</Sheet.Header>

			<div class="no-scrollbar flex-1 overflow-y-auto">
				<dl class="border-border/50 bg-muted/5 grid grid-cols-2 gap-6 border-b p-6">
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.workspaces.sheet.slug')}</dt>
						<dd class="truncate font-mono text-sm">{workspace.slug}</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.workspaces.sheet.currency')}</dt>
						<dd class="font-mono text-sm">{workspace.currency_code}</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.workspaces.sheet.created')}</dt>
						<dd class="text-sm tabular-nums">{formatDay(workspace.created_at)}</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.workspaces.sheet.last_activity')}</dt>
						<dd class="text-sm tabular-nums">
							{workspace.last_activity_at ? formatDay(workspace.last_activity_at) : t('console.never')}
						</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.workspaces.sheet.plan')}</dt>
						<dd class="truncate text-sm">{workspace.plan_name}</dd>
					</div>
					{#if workspace.suspended_at}
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.suspended')}</dt>
							<dd class="text-sm tabular-nums">{formatDay(workspace.suspended_at)}</dd>
						</div>
					{/if}
					{#if workspace.deleted_at}
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.deleted')}</dt>
							<dd class="text-sm tabular-nums">{formatDay(workspace.deleted_at)}</dd>
						</div>
					{/if}
				</dl>

				{#if plans}
					<form method="POST" action="?/plan" use:progressive class="border-border/50 space-y-3 border-b p-6">
						<label for="workspace-plan" class={capsLabel}>{t('console.workspaces.sheet.plan')}</label>
						<input type="hidden" name="id" value={workspace.id} />
						<div class="flex items-center gap-2">
							<!-- The flex child is the picker's own wrapper, not its trigger,
							     so the width goes on a box around it. -->
							<div class="min-w-0 flex-1">
								<SelectPlan
									id="workspace-plan"
									name="plan_id"
									{plans}
									bind:value={planId}
									placeholder={t('console.workspaces.sheet.plan_placeholder')}
									searchPlaceholder={t('console.workspaces.sheet.plan_search')}
									ariaLabel={t('console.workspaces.sheet.plan')}
									class="w-full"
								/>
							</div>
							<Button
								type="submit"
								variant="outline"
								loading={savingPlan}
								disabled={!planId || planId === workspace.plan_id}
							>
								{t('console.workspaces.sheet.plan_save')}
							</Button>
						</div>
					</form>
				{/if}

				<section class="border-border/50 space-y-3 border-b p-6">
					<h3 class={capsLabel}>{t('console.workspaces.sheet.contents')}</h3>
					<dl class="grid grid-cols-2 gap-6">
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.wallets')}</dt>
							<dd class="font-serif text-2xl tabular-nums">{formatCount(workspace.counts.wallets)}</dd>
						</div>
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.transactions')}</dt>
							<dd class="font-serif text-2xl tabular-nums">{formatCount(workspace.counts.transactions)}</dd>
						</div>
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.storage')}</dt>
							<dd class="font-serif text-2xl tabular-nums">{formatBytes(workspace.storage.bytes)}</dd>
						</div>
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.files')}</dt>
							<dd class="font-serif text-2xl tabular-nums">{formatCount(workspace.storage.files)}</dd>
						</div>
					</dl>
				</section>

				<section class="border-border/50 space-y-3 border-b p-6">
					<h3 class={capsLabel}>{t('console.workspaces.sheet.tokens_month')}</h3>
					<dl class="grid grid-cols-2 gap-6">
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.tokens_input')}</dt>
							<dd class="font-serif text-2xl tabular-nums">{formatCount(workspace.tokens_month.input)}</dd>
						</div>
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.workspaces.sheet.tokens_output')}</dt>
							<dd class="font-serif text-2xl tabular-nums">{formatCount(workspace.tokens_month.output)}</dd>
						</div>
					</dl>
				</section>

				<section class="space-y-3 p-6">
					<h3 class={capsLabel}>{t('console.workspaces.sheet.members')}</h3>
					{#each workspace.member_list as member (member.user_id)}
						<a
							href="/console/users?user={encodeURIComponent(member.user_id)}"
							class="border-border/50 hover:bg-muted/30 flex items-center justify-between gap-3 border p-3 transition-colors"
						>
							<div class="min-w-0 space-y-0.5">
								<p class="truncate text-sm font-medium">{member.email}</p>
								<p class="text-muted-foreground truncate text-[11px]">
									{member.name ?? t('console.workspaces.sheet.no_name')}
								</p>
							</div>
							<div class="shrink-0 space-y-0.5 text-right">
								<p class="text-sm">{ROLE[member.role]}</p>
								<p class="text-muted-foreground text-[11px] tabular-nums">{formatDay(member.joined_at)}</p>
							</div>
						</a>
					{:else}
						<p class="text-muted-foreground text-sm">{t('console.workspaces.sheet.no_members')}</p>
					{/each}
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
