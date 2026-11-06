<script lang="ts">
	/**
	 * Password, passkeys and sessions (AUTH-12, D94, D110). New here: the old
	 * app had no way to change a password, add a passkey or see where it was
	 * signed in, so this follows the settings sections' own shape rather than
	 * a page to copy. Passkeys list as the sessions do.
	 */
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-circle';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import LogOut from '@lucide/svelte/icons/log-out';
	import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
	import { toast } from 'svelte-sonner';

	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/atoms/button';
	import { PasswordInput } from '$lib/components/molecules/password-input';
	import { Label } from '$lib/components/atoms/label';
	import { Separator } from '$lib/components/atoms/separator';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { addPasskey, passkeysSupported } from '$lib/passkeys';

	let { data, form } = $props();

	let adding = $state(false);
	let removing = $state<{ id: string; name: string } | null>(null);
	let confirmRemove = $state(false);
	let removeForm = $state<HTMLFormElement | null>(null);

	/** Make a passkey on this device, named after it (D110). */
	async function add() {
		if (!passkeysSupported()) {
			toast.error(t('account.security.passkey_unsupported'));
			return;
		}
		adding = true;
		const outcome = await addPasskey(device(navigator.userAgent));
		adding = false;

		if (outcome.status === 'ok') {
			toast.success(t('account.security.passkey_added'));
			await invalidateAll();
		} else if (outcome.status === 'failed') {
			toast.error(
				outcome.code && outcome.code !== 'VALIDATION_FAILED'
					? messageForCode(outcome.code)
					: t('account.security.passkey_failed')
			);
		}
	}

	let saving = $state(false);
	let confirmLogout = $state(false);
	let logoutForm = $state<HTMLFormElement | null>(null);
	let passwordForm = $state<HTMLFormElement | null>(null);

	const date = (value: string) =>
		new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(value)
		);

	/** A user agent, cut to what a person recognises. */
	function device(agent: string | null): string {
		if (!agent) return t('account.security.session_unknown');
		const browser = /Edg\//.test(agent)
			? 'Edge'
			: /Chrome\//.test(agent)
				? 'Chrome'
				: /Firefox\//.test(agent)
					? 'Firefox'
					: /Safari\//.test(agent)
						? 'Safari'
						: agent.split(/[ /]/)[0];
		const system = /Mac OS X/.test(agent)
			? 'macOS'
			: /Windows/.test(agent)
				? 'Windows'
				: /Android/.test(agent)
					? 'Android'
					: /iPhone|iPad/.test(agent)
						? 'iOS'
						: /Linux/.test(agent)
							? 'Linux'
							: '';
		return system ? `${browser} · ${system}` : browser;
	}
</script>

<svelte:head>
	<title>{pageTitle(t('account.security.title'), t('account.title'))}</title>
</svelte:head>

<div class="space-y-8">
	<SettingsSectionHeader
		title={t('account.security.title')}
		description={t('account.security.description')}
	/>

	<section class="space-y-4">
		<h2 class="text-sm font-medium">{t('account.security.password_title')}</h2>
		<FormError
			message={form?.code && !form?.fields ? messageForCode(form.code) : undefined}
		/>
		<form
			bind:this={passwordForm}
			method="POST"
			action="?/password"
			class="space-y-6"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') {
						passwordForm?.reset();
						toast.success(t('account.security.changed'));
						await invalidateAll();
					} else {
						await update({ reset: false });
					}
				};
			}}
		>
			<div class="space-y-2">
				<Label for="current-password">{t('account.security.current_label')}</Label>
				<PasswordInput
					id="current-password"
					name="current_password"
					autocomplete="current-password"
					class="max-w-md"
					required
				/>
				<FieldError message={form?.fields?.current_password} />
			</div>
			<div class="space-y-2">
				<Label for="new-password">{t('account.security.new_label')}</Label>
				<PasswordInput
					id="new-password"
					name="new_password"
					autocomplete="new-password"
					minlength={8}
					class="max-w-md"
					required
				/>
				<p class="text-muted-foreground text-xs">{t('account.security.new_hint')}</p>
				<FieldError message={form?.fields?.new_password ?? form?.fields?.password} />
			</div>
			<Button type="submit" class="h-8 text-xs" disabled={saving}>
				{#if saving}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
				{t('account.security.change')}
			</Button>
		</form>
	</section>

	<Separator />

	<section class="space-y-4">
		<div class="space-y-1">
			<h2 class="text-sm font-medium">{t('account.security.passkeys_title')}</h2>
			<p class="text-muted-foreground text-xs">{t('account.security.passkeys_description')}</p>
		</div>

		{#if data.passkeys.length === 0}
			<p class="text-muted-foreground text-xs">{t('account.security.no_passkeys')}</p>
		{:else}
			<ul class="divide-y border">
				{#each data.passkeys as passkey (passkey.id)}
					<li class="flex items-center gap-4 px-4 py-3">
						<div class="flex size-10 shrink-0 items-center justify-center bg-muted">
							<KeyRound class="size-4 text-muted-foreground" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-sm">{passkey.name}</p>
							<p class="text-[11px] text-muted-foreground">
								{t('account.security.passkey_added_on', { date: date(passkey.created_at) })}
								·
								{passkey.last_used_at
									? t('account.security.passkey_last_used', { date: date(passkey.last_used_at) })
									: t('account.security.passkey_never_used')}
							</p>
						</div>
						<Button
							variant="ghost-destructive"
							size="icon"
							aria-label={t('account.security.remove_passkey', { name: passkey.name })}
							onclick={() => {
								removing = { id: passkey.id, name: passkey.name };
								confirmRemove = true;
							}}
						>
							<Trash2 />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			bind:this={removeForm}
			method="POST"
			action="?/removePasskey"
			class="hidden"
			use:enhance={() =>
				async ({ result, update }) => {
					if (result.type === 'success') toast.success(t('account.security.passkey_removed'));
					else if (result.type === 'failure') {
						toast.error(messageForCode(String(result.data?.code ?? '')));
					}
					await update();
				}}
		>
			<input type="hidden" name="id" value={removing?.id ?? ''} />
		</form>

		<Button variant="outline" class="h-8 text-xs" disabled={adding} onclick={add}>
			{#if adding}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
			{:else}
				<Plus class="mr-2 h-4 w-4" />
			{/if}
			{t('account.security.add_passkey')}
		</Button>
	</section>

	<Separator />

	<section class="space-y-4">
		<div class="space-y-1">
			<h2 class="text-sm font-medium">{t('account.security.sessions_title')}</h2>
			<p class="text-muted-foreground text-xs">{t('account.security.sessions_description')}</p>
		</div>

		{#if data.sessions.length === 0}
			<p class="text-muted-foreground text-xs">{t('account.security.no_sessions')}</p>
		{:else}
			<ul class="divide-y border">
				{#each data.sessions as session (session.id)}
					<li class="flex items-center gap-4 px-4 py-3">
						<div class="flex size-10 shrink-0 items-center justify-center bg-muted">
							<MonitorSmartphone class="size-4 text-muted-foreground" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-sm">{device(session.user_agent)}</p>
							<p class="text-[11px] text-muted-foreground">
								{t('account.security.session_started', { date: date(session.created_at) })}
								{#if session.ip}· {session.ip}{/if}
							</p>
						</div>
						<p class="hidden text-[11px] text-muted-foreground sm:block">
							{t('account.security.session_expires', { date: date(session.expires_at) })}
						</p>
					</li>
				{/each}
			</ul>
		{/if}

		<form bind:this={logoutForm} method="POST" action="?/logoutAll" class="hidden"></form>
		<Button variant="outline-destructive" class="h-8 text-xs" onclick={() => (confirmLogout = true)}>
			<LogOut class="mr-2 h-4 w-4" />
			{t('account.security.logout_all')}
		</Button>
	</section>
</div>

<ConfirmDialog
	bind:open={confirmRemove}
	title={t('account.security.remove_passkey_confirm')}
	description={t('account.security.remove_passkey_description', { name: removing?.name ?? '' })}
	confirmLabel={t('account.security.remove')}
	onConfirm={() => removeForm?.requestSubmit()}
/>

<ConfirmDialog
	bind:open={confirmLogout}
	title={t('account.security.logout_all_confirm')}
	description={t('account.security.logout_all_description')}
	confirmLabel={t('account.security.logout_all')}
	onConfirm={() => logoutForm?.requestSubmit()}
/>
