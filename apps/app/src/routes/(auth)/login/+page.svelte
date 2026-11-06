<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-circle';

	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { PasswordInput } from '$lib/components/molecules/password-input';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { passkeysSupported, signInWithPasskey } from '$lib/passkeys';

	let { form } = $props();

	let submitting = $state(false);
	const next = $derived(page.url.searchParams.get('next') ?? '');

	let passkeyPending = $state(false);
	let passkeyError = $state<string | undefined>();

	/**
	 * Sign in with a passkey (D110): any one this browser holds for the
	 * site, so no email is asked for first.
	 */
	async function passkey() {
		passkeyError = undefined;
		if (!passkeysSupported()) {
			passkeyError = t('auth.passkey_unsupported');
			return;
		}
		passkeyPending = true;
		const outcome = await signInWithPasskey(next);
		passkeyPending = false;

		if (outcome.status === 'ok') {
			await goto(outcome.data.location, { invalidateAll: true });
		} else if (outcome.status === 'failed') {
			passkeyError = outcome.code ? messageForCode(outcome.code) : t('auth.passkey_failed');
		}
	}
</script>

<svelte:head><title>{pageTitle(t('auth.login_title'))}</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">{t('auth.login_title')}</h1>
<p class="text-muted-foreground mt-1 mb-6 text-sm">{t('auth.login_subtitle')}</p>

<FormError message={passkeyError ?? (form?.code ? messageForCode(form.code) : undefined)} />

<!-- A plain form action: it works with JavaScript disabled, and `enhance`
     only makes the same path faster. -->
<form
	method="POST"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
	class="space-y-4"
>
	<input type="hidden" name="next" value={next} />

	<div>
		<label for="email" class="mb-1.5 block text-sm font-medium">{t('auth.email')}</label>
		<Input
			id="email"
			name="email"
			type="email"
			autocomplete="email"
			required
			value={form?.email ?? ''}
			aria-invalid={form?.fields?.email ? 'true' : undefined}
		/>
		<FieldError message={form?.fields?.email} />
	</div>

	<div>
		<div class="mb-1.5 flex items-baseline justify-between">
			<label for="password" class="block text-sm font-medium">{t('auth.password')}</label>
			<a href="/forgot-password" class="text-muted-foreground text-xs underline">
				{t('auth.forgot_password')}
			</a>
		</div>
		<PasswordInput
			id="password"
			name="password"
			autocomplete="current-password"
			required
			aria-invalid={form?.fields?.password ? 'true' : undefined}
		/>
		<FieldError message={form?.fields?.password} />
	</div>

	<Button type="submit" class="w-full" disabled={submitting}>
		{submitting ? t('auth.signing_in') : t('auth.sign_in')}
	</Button>
</form>

<!-- The old app's divider between the form and its other ways in. -->
<div class="relative py-5 text-center">
	<div class="absolute inset-0 flex items-center">
		<span class="border-border w-full border-t"></span>
	</div>
	<div class="relative flex justify-center">
		<span class="bg-background text-muted-foreground px-4 text-sm">{t('auth.or')}</span>
	</div>
</div>

<Button type="button" variant="outline" class="w-full" disabled={passkeyPending} onclick={passkey}>
	{#if passkeyPending}
		<Loader2 class="animate-spin" />
		{t('auth.passkey_waiting')}
	{:else}
		<KeyRound />
		{t('auth.passkey_sign_in')}
	{/if}
</Button>

<p class="text-muted-foreground mt-6 text-center text-sm">
	{t('auth.no_account')}
	<a
		href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
		class="text-foreground underline">{t('auth.sign_up')}</a
	>
</p>
