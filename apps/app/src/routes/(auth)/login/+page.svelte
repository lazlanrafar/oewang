<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	let { form } = $props();

	let submitting = $state(false);
	const next = $derived(page.url.searchParams.get('next') ?? '/');
</script>

<svelte:head><title>{pageTitle(t('auth.login_title'))}</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">{t('auth.login_title')}</h1>
<p class="text-muted-foreground mt-1 mb-6 text-sm">{t('auth.login_subtitle')}</p>

<FormError message={form?.code ? messageForCode(form.code) : undefined} />

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
		<Input
			id="password"
			name="password"
			type="password"
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

<p class="text-muted-foreground mt-6 text-center text-sm">
	{t('auth.no_account')}
	<a href="/register" class="text-foreground underline">{t('auth.sign_up')}</a>
</p>
