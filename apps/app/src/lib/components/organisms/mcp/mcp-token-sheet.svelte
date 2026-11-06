<script lang="ts">
	/**
	 * Make an MCP token (D106), laid out to the SHEET_GUIDE rules of the
	 * other form sheets. Three choices: a name to recognise it by, how far it
	 * reaches (every workspace, including ones joined later, or a picked
	 * set), and when it expires.
	 *
	 * Once made, the sheet shows the token. The API returns it once and keeps
	 * only its hash, so this is the only moment it can be copied.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { toast } from 'svelte-sonner';

	import { Alert, AlertDescription, AlertTitle } from '$lib/components/atoms/alert';
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { NativeSelect } from '$lib/components/atoms/native-select';
	import * as RadioGroup from '$lib/components/atoms/radio-group';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { t } from '$lib/i18n';

	let {
		open = $bindable(false),
		workspaces,
		saving = false,
		fieldErrors,
		secret = null,
		enhance
	}: {
		open?: boolean;
		workspaces: { id: string; name: string }[];
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The token just made; null until one is. */
		secret?: string | null;
		/** SvelteKit's `enhance`, passed in so the page owns the save. */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	let scope = $state<'all' | 'some'>('all');
	let picked = $state<string[]>([]);
	let copied = $state(false);

	$effect(() => {
		if (open) return;
		scope = 'all';
		picked = [];
		copied = false;
	});

	function toggle(id: string, on: boolean) {
		picked = on ? [...picked, id] : picked.filter((value) => value !== id);
	}

	async function copy() {
		if (!secret) return;
		await navigator.clipboard.writeText(secret);
		copied = true;
		toast.success(t('account.mcp.copied'));
	}

	const progressive = (node: HTMLFormElement) => enhance?.(node);
	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<Sheet.Header class="shrink-0 px-6 pt-6">
			<Sheet.Title class="text-lg">
				{secret ? t('account.mcp.secret_title') : t('account.mcp.sheet_title')}
			</Sheet.Title>
			<Sheet.Description>{t('account.mcp.sheet_description')}</Sheet.Description>
		</Sheet.Header>

		{#if secret}
			<div class="flex-1 space-y-4 overflow-y-auto px-6 pt-6 pb-[100px]">
				<div class="flex gap-2">
					<Input readonly value={secret} aria-label={t('account.mcp.secret_title')} />
					<Button variant="outline" size="icon" aria-label={t('account.mcp.copy')} onclick={copy}>
						{#if copied}<Check />{:else}<Copy />{/if}
					</Button>
				</div>
				<Alert variant="warning">
					<TriangleAlert />
					<AlertTitle>{t('account.mcp.secret_title')}</AlertTitle>
					<AlertDescription>{t('account.mcp.secret_warning')}</AlertDescription>
				</Alert>
			</div>
			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button class="w-full" onclick={() => (open = false)}>{t('account.mcp.done')}</Button>
			</div>
		{:else}
			<form method="POST" action="?/create" use:progressive class="flex h-full flex-col">
				<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
					<div class="space-y-6">
						<div class="grid gap-2">
							<Label for="mcp-token-name" class={labelClass}>{t('account.mcp.name_label')}</Label>
							<Input
								id="mcp-token-name"
								name="name"
								required
								maxlength={100}
								autocomplete="off"
								placeholder={t('account.mcp.name_placeholder')}
							/>
							<FieldError message={fieldErrors?.name} />
						</div>

						<div class="grid gap-3">
							<Label class={labelClass}>{t('account.mcp.workspaces_label')}</Label>
							<RadioGroup.Root bind:value={scope} name="scope" class="grid gap-2">
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="all" id="mcp-scope-all" />
									<Label for="mcp-scope-all" class="text-sm font-normal">
										{t('account.mcp.workspaces_all')}
									</Label>
								</div>
								<div class="flex items-center gap-2">
									<RadioGroup.Item value="some" id="mcp-scope-some" />
									<Label for="mcp-scope-some" class="text-sm font-normal">
										{t('account.mcp.workspaces_some')}
									</Label>
								</div>
							</RadioGroup.Root>
							{#if scope === 'some'}
								<div class="grid gap-2 pl-6">
									{#each workspaces as workspace (workspace.id)}
										<div class="flex items-center gap-2">
											<Checkbox
												id="mcp-ws-{workspace.id}"
												checked={picked.includes(workspace.id)}
												onCheckedChange={(on) => toggle(workspace.id, on === true)}
											/>
											<Label for="mcp-ws-{workspace.id}" class="text-sm font-normal">
												{workspace.name}
											</Label>
										</div>
									{/each}
									{#each picked as id (id)}
										<input type="hidden" name="workspace_ids" value={id} />
									{/each}
								</div>
							{/if}
							<FieldError message={fieldErrors?.workspace_ids} />
						</div>

						<div class="grid gap-2">
							<Label for="mcp-token-expiry" class={labelClass}>{t('account.mcp.expiry_label')}</Label>
							<NativeSelect id="mcp-token-expiry" name="expires_in_days" value="90">
								<option value="30">{t('account.mcp.expiry_30')}</option>
								<option value="90">{t('account.mcp.expiry_90')}</option>
								<option value="365">{t('account.mcp.expiry_365')}</option>
								<option value="never">{t('account.mcp.expiry_never')}</option>
							</NativeSelect>
							<FieldError message={fieldErrors?.expires_in_days} />
						</div>
					</div>
				</div>

				<div class="bg-background absolute inset-x-0 bottom-0 p-6">
					<Button
						type="submit"
						class="w-full"
						loading={saving}
						disabled={scope === 'some' && picked.length === 0}
					>
						{t('account.mcp.create')}
					</Button>
				</div>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
