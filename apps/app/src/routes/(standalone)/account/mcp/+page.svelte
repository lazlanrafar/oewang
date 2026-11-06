<script lang="ts">
	/**
	 * MCP (D106): connect an AI app, and the personal tokens it uses. The
	 * app acts as this person, in the workspaces a token allows, with this
	 * person's role in each; every rule of the app holds, because the API
	 * runs the same handlers for it.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import { Separator } from '$lib/components/atoms/separator';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		McpSetup,
		McpTokenSheet,
		McpTokensList,
		type McpClient
	} from '$lib/components/organisms/mcp';
	import { SettingsSectionGroup, SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { McpToken } from '$lib/server/mcp';
	import { readParam, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const CLIENTS = ['claude-code', 'cursor', 'claude-desktop', 'other'] as const;
	const client = $derived(readParam(page.url, 'client', CLIENTS, 'claude-code') as McpClient);

	// ------------------------------------------------------------ create

	let sheetOpen = $state(false);
	let saving = $state(false);
	let secret = $state<string | null>(null);

	function openSheet() {
		secret = null;
		sheetOpen = true;
	}

	const createSubmit: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success' && result.data?.secret) {
				secret = String(result.data.secret);
			}
			await update({ reset: false, navigate: false });
		};
	};
	const createAction = (node: HTMLFormElement) => enhance(node, createSubmit);

	// ------------------------------------------------------------ revoke

	let revoking = $state<McpToken | null>(null);
	let confirmRevoke = $state(false);
	let revokeForm = $state<HTMLFormElement | null>(null);

	async function askRevoke(token: McpToken) {
		revoking = token;
		confirmRevoke = true;
		await tick();
	}
</script>

<svelte:head>
	<title>{pageTitle(t('account.mcp.title'), t('account.title'))}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader title={t('account.mcp.title')} description={t('account.mcp.description')} />

	<FormError message={form?.code && !sheetOpen ? messageForCode(form.code) : undefined} />

	<SettingsSectionGroup
		title={t('account.mcp.connect_title')}
		description={t('account.mcp.connect_description')}
	>
		<McpSetup url={data.mcpUrl} {client} onClientChange={(next) => writeParams({ client: next })} />
	</SettingsSectionGroup>

	<Separator />

	<SettingsSectionGroup
		title={t('account.mcp.tokens_title')}
		description={t('account.mcp.tokens_description')}
	>
		<div>
			<Button size="sm" onclick={openSheet}>
				<Plus class="size-3.5" />
				{t('account.mcp.token_new')}
			</Button>
		</div>
		<McpTokensList
			tokens={data.tokens}
			workspaces={data.workspaces}
			empty={t('account.mcp.tokens_empty')}
			onRevoke={askRevoke}
		/>
	</SettingsSectionGroup>
</div>

<form
	bind:this={revokeForm}
	method="POST"
	action="?/revoke"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') toast.success(t('account.mcp.revoked'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={revoking?.id ?? ''} />
</form>

<McpTokenSheet
	bind:open={sheetOpen}
	workspaces={data.workspaces}
	{saving}
	{secret}
	fieldErrors={form?.fields}
	enhance={createAction}
/>

<ConfirmDialog
	bind:open={confirmRevoke}
	title={t('account.mcp.revoke_title')}
	description={t('account.mcp.revoke_description', { name: revoking?.name ?? '' })}
	confirmLabel={t('account.mcp.revoke')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => revokeForm?.requestSubmit()}
/>
