<script lang="ts">
	/**
	 * Approve an MCP connector app (D106, MCP-9): who is asking, where the
	 * answer goes, what it may do, and which workspaces it may reach. The
	 * request's own parameters ride along as hidden fields, and the server
	 * checks them again before acting on either button.
	 */
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { page } from '$app/state';

	import { Alert, AlertDescription } from '$lib/components/atoms/alert';
	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import { Logo } from '$lib/components/atoms/logo';
	import { FormError } from '$lib/components/molecules/form-error';
	import { McpWorkspacePicker } from '$lib/components/organisms/mcp';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	let { data, form } = $props();

	let scope = $state<'all' | 'some'>('all');
	/** The request's query rides on the action URL too, so a refused
	 *  submission renders this page again rather than an empty one. */
	const action = (name: string) => `${page.url.search || '?'}&/${name}`;
	let picked = $state<string[]>([]);
</script>

<svelte:head><title>{pageTitle(t('oauth.title'))}</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-4 py-10">
	<Logo class="size-8" />

	{#if data.invalid}
		<h1 class="text-lg font-medium">{t('oauth.invalid_title')}</h1>
		<p class="text-subtle text-sm">{t('oauth.invalid_body')}</p>
	{:else}
		<div class="flex flex-col gap-2">
			<h1 class="text-lg font-medium">{t('oauth.heading', { name: data.client.name })}</h1>
			<p class="text-subtle text-xs">{t('oauth.signed_in_as', { email: data.me.user.email })}</p>
		</div>

		<Alert variant="warning">
			<TriangleAlert />
			<AlertDescription>
				{t('oauth.unverified')}
				{t('oauth.redirect', { host: data.client.host })}
			</AlertDescription>
		</Alert>

		<p class="text-sm">{t('oauth.can')}</p>

		<FormError message={form?.code ? messageForCode(form.code) : undefined} />

		<form method="POST" class="flex flex-col gap-6">
			{#each Object.entries(data.request) as [name, value] (name)}
				<input type="hidden" {name} {value} />
			{/each}

			<div class="grid gap-3">
				<Label class="text-subtle text-xs font-normal">{t('oauth.workspaces_label')}</Label>
				<McpWorkspacePicker
					workspaces={data.workspaces}
					bind:scope
					bind:picked
					error={form?.fields?.workspace_ids}
					idPrefix="oauth"
				/>
			</div>

			<div class="flex gap-2">
				<Button type="submit" formaction={action('deny')} variant="outline" class="flex-1">
					{t('oauth.deny')}
				</Button>
				<Button
					type="submit"
					formaction={action('allow')}
					class="flex-1"
					disabled={scope === 'some' && picked.length === 0}
				>
					{t('oauth.allow')}
				</Button>
			</div>
		</form>
	{/if}
</main>
