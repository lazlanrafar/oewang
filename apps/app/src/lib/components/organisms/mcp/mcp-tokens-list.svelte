<script lang="ts">
	/**
	 * MCP tokens or connected apps, one row each (D106), drawn as the
	 * security page draws sessions: what it is, how far it reaches, when it
	 * was last used, and a way to end it.
	 */
	import KeyRound from '@lucide/svelte/icons/key-round';

	import { Button } from '$lib/components/atoms/button';
	import { t } from '$lib/i18n';
	import type { McpToken } from '$lib/server/mcp';

	let {
		tokens,
		workspaces,
		empty,
		onRevoke
	}: {
		tokens: McpToken[];
		/** To show a token's reach by name. */
		workspaces: { id: string; name: string }[];
		empty: string;
		onRevoke: (token: McpToken) => void;
	} = $props();

	const date = (value: string) =>
		new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

	function scope(token: McpToken): string {
		if (!token.workspace_ids) return t('account.mcp.token_scope_all');
		return token.workspace_ids
			.map((id) => workspaces.find((workspace) => workspace.id === id)?.name ?? id)
			.join(', ');
	}
</script>

{#if tokens.length === 0}
	<p class="text-muted-foreground text-xs">{empty}</p>
{:else}
	<ul class="divide-y border">
		{#each tokens as token (token.id)}
			<li class="flex items-center gap-4 px-4 py-3">
				<div class="bg-muted flex size-10 shrink-0 items-center justify-center">
					<KeyRound class="text-muted-foreground size-4" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">
						{token.name}
						<span class="text-muted-foreground font-mono text-[11px] font-normal">{token.token_prefix}…</span>
					</p>
					<p class="text-muted-foreground truncate text-[11px]">{scope(token)}</p>
					<p class="text-muted-foreground text-[11px]">
						{t('account.mcp.token_created', { date: date(token.created_at) })} ·
						{token.last_used_at
							? t('account.mcp.token_last_used', { date: date(token.last_used_at) })
							: t('account.mcp.token_never_used')} ·
						{token.expires_at
							? t('account.mcp.token_expires', { date: date(token.expires_at) })
							: t('account.mcp.token_never_expires')}
					</p>
				</div>
				<Button variant="ghost-destructive" size="sm" onclick={() => onRevoke(token)}>
					{t('account.mcp.revoke')}
				</Button>
			</li>
		{/each}
	</ul>
{/if}
