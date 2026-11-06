<script lang="ts">
	/**
	 * Invite someone (WS-3), laid out to the same SHEET_GUIDE rules as the
	 * other form sheets: a header with no rule, the fields, and one
	 * full-width submit at the foot.
	 *
	 * Two fields, the old dialog's: an email address and a role. The roles are
	 * a list fixed in the source, so a native select (D79), and an admin is
	 * not offered owner, which the API would refuse anyway.
	 *
	 * Once sent, the sheet shows the link. The API returns the token once,
	 * so this is the only moment it can be copied, and the only way to hand
	 * it over where no mail is sent.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { NativeSelect } from '$lib/components/atoms/native-select';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { t } from '$lib/i18n';
	import { roleLabel, type WorkspaceRole } from '$lib/workspaces';

	let {
		open = $bindable(false),
		viewerRole,
		saving = false,
		fieldErrors,
		sent = null,
		enhance
	}: {
		open?: boolean;
		viewerRole: WorkspaceRole;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The invitation just sent, with its link; null until one is. */
		sent?: { email: string; link: string } | null;
		/** SvelteKit's `enhance`, passed in so the page owns the save. */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const roles = $derived<WorkspaceRole[]>(
		viewerRole === 'owner' ? ['member', 'admin', 'owner'] : ['member', 'admin']
	);

	let copied = $state(false);

	async function copy() {
		if (!sent) return;
		await navigator.clipboard.writeText(sent.link);
		copied = true;
		toast.success(t('settings.invite_copied'));
	}

	$effect(() => {
		if (!open) copied = false;
	});

	const progressive = (node: HTMLFormElement) => enhance?.(node);

	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<Sheet.Header class="shrink-0 px-6 pt-6">
			<Sheet.Title class="text-lg">{t('settings.invite_title')}</Sheet.Title>
			<Sheet.Description>{t('settings.invite_description')}</Sheet.Description>
		</Sheet.Header>

		{#if sent}
			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
				<div class="grid gap-2">
					<p class="text-sm">{t('settings.invite_sent', { email: sent.email })}</p>
					<Label for="invite-link" class={labelClass}>{t('settings.invite_link_label')}</Label>
					<div class="flex gap-2">
						<Input id="invite-link" readonly value={sent.link} />
						<Button variant="outline" size="icon" aria-label={t('settings.invite_copy')} onclick={copy}>
							{#if copied}<Check />{:else}<Copy />{/if}
						</Button>
					</div>
					<p class="text-subtle text-xs">{t('settings.invite_link_hint', { email: sent.email })}</p>
				</div>
			</div>
			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button class="w-full" onclick={() => (open = false)}>{t('settings.invite_done')}</Button>
			</div>
		{:else}
			<form method="POST" action="?/invite" use:progressive class="flex h-full flex-col">
				<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
					<div class="space-y-6">
						<div class="grid gap-2">
							<Label for="invite-email" class={labelClass}>{t('settings.invite_email_label')}</Label>
							<Input
								id="invite-email"
								name="email"
								type="email"
								required
								autocomplete="off"
								placeholder={t('settings.invite_email_placeholder')}
							/>
							<FieldError message={fieldErrors?.email} />
						</div>

						<div class="grid gap-2">
							<Label for="invite-role" class={labelClass}>{t('settings.invite_role_label')}</Label>
							<NativeSelect id="invite-role" name="role" value="member">
								{#each roles as role (role)}
									<option value={role}>{roleLabel(role)}</option>
								{/each}
							</NativeSelect>
							<p class="text-subtle text-xs">{t('settings.invite_role_hint')}</p>
							<FieldError message={fieldErrors?.role} />
						</div>
					</div>
				</div>

				<div class="bg-background absolute inset-x-0 bottom-0 p-6">
					<Button type="submit" class="w-full" loading={saving}>
						{t('settings.invite_send')}
					</Button>
				</div>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
