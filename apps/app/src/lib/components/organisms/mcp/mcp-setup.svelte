<script lang="ts" module>
	export type McpClient = 'claude-code' | 'cursor' | 'claude-desktop' | 'other';
</script>

<script lang="ts">
	/**
	 * How to add oewang to an AI app (D106): the server URL, and the
	 * configuration each common client wants, with a placeholder where the
	 * token goes. The token itself is never written into these snippets, so
	 * nothing here is a secret.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { t, type TranslationKey } from '$lib/i18n';


	let {
		url,
		client,
		onClientChange
	}: {
		/** The public MCP endpoint, `https://…/mcp`. */
		url: string;
		client: McpClient;
		onClientChange: (client: McpClient) => void;
	} = $props();

	const CLIENTS: { id: McpClient; label: TranslationKey; help: TranslationKey }[] = [
		{ id: 'claude-code', label: 'account.mcp.client_claude_code', help: 'account.mcp.setup_claude_code' },
		{ id: 'cursor', label: 'account.mcp.client_cursor', help: 'account.mcp.setup_cursor' },
		{ id: 'claude-desktop', label: 'account.mcp.client_claude_desktop', help: 'account.mcp.setup_claude_desktop' },
		{ id: 'other', label: 'account.mcp.client_other', help: 'account.mcp.setup_other' }
	];

	/** Code, not copy: what the client's config literally needs. */
	const snippet = $derived.by(() => {
		switch (client) {
			case 'claude-code':
				return `claude mcp add --transport http oewang ${url} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`;
			case 'cursor':
				return JSON.stringify(
					{ mcpServers: { oewang: { url, headers: { Authorization: 'Bearer YOUR_TOKEN' } } } },
					null,
					2
				);
			case 'claude-desktop':
				return JSON.stringify(
					{
						mcpServers: {
							oewang: {
								command: 'npx',
								args: ['-y', 'mcp-remote', url, '--header', 'Authorization:Bearer YOUR_TOKEN']
							}
						}
					},
					null,
					2
				);
			default:
				return '';
		}
	});

	const current = $derived(CLIENTS.find((entry) => entry.id === client) ?? CLIENTS[0]);

	let copied = $state<string | null>(null);

	async function copy(value: string, which: string) {
		await navigator.clipboard.writeText(value);
		copied = which;
		toast.success(t('account.mcp.copied'));
		setTimeout(() => (copied = null), 1500);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="grid gap-2">
		<Label for="mcp-url" class="text-subtle text-xs font-normal">{t('account.mcp.server_url')}</Label>
		<div class="flex gap-2">
			<Input id="mcp-url" readonly value={url} />
			<Button variant="outline" size="icon" aria-label={t('account.mcp.copy')} onclick={() => copy(url, 'url')}>
				{#if copied === 'url'}<Check />{:else}<Copy />{/if}
			</Button>
		</div>
	</div>

	<Tabs.Root value={client} onValueChange={(next) => onClientChange(next as McpClient)} activationMode="manual">
		<Tabs.List>
			{#each CLIENTS as entry (entry.id)}
				<Tabs.Trigger value={entry.id}>{t(entry.label)}</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	<p class="text-subtle text-xs">{t(current.help)}</p>

	{#if snippet}
		<div class="relative">
			<pre class="bg-muted overflow-x-auto p-4 pr-12 text-xs"><code>{snippet}</code></pre>
			<Button
				variant="ghost"
				size="icon"
				class="absolute top-2 right-2"
				aria-label={t('account.mcp.copy')}
				onclick={() => copy(snippet, 'snippet')}
			>
				{#if copied === 'snippet'}<Check />{:else}<Copy />{/if}
			</Button>
		</div>
	{/if}
</div>
