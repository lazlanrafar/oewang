<script lang="ts">
	import { enhance } from '$app/forms';

	import FieldError from '$lib/components/shell/field-error.svelte';
	import FormError from '$lib/components/shell/form-error.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>{t('auth.register_title')}</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">{t('auth.register_title')}</h1>
<p class="text-muted-foreground mt-1 mb-6 text-sm">{t('auth.register_subtitle')}</p>

<FormError message={form?.code ? messageForCode(form.code) : undefined} />

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
		<label for="password" class="mb-1.5 block text-sm font-medium">{t('auth.password')}</label>
		<Input
			id="password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
			minlength={10}
			aria-describedby="password-hint"
			aria-invalid={form?.fields?.password ? 'true' : undefined}
		/>
		<p id="password-hint" class="text-muted-foreground mt-1 text-xs">
			{t('auth.password_hint')}
		</p>
		<FieldError message={form?.fields?.password} />
	</div>

	<div>
		<label for="name" class="mb-1.5 block text-sm font-medium">{t('auth.name_optional')}</label>
		<Input id="name" name="name" autocomplete="name" value={form?.name ?? ''} />
	</div>

	<div>
		<label for="workspace_name" class="mb-1.5 block text-sm font-medium">
			{t('auth.workspace_name')}
		</label>
		<Input
			id="workspace_name"
			name="workspace_name"
			required
			value={form?.workspaceName ?? ''}
			aria-invalid={form?.fields?.workspace_name ? 'true' : undefined}
		/>
		<FieldError message={form?.fields?.workspace_name} />
	</div>

	<Button type="submit" class="w-full" disabled={submitting}>
		{submitting ? t('auth.creating') : t('auth.sign_up')}
	</Button>
</form>

<p class="text-muted-foreground mt-6 text-center text-sm">
	{t('auth.have_account')}
	<a href="/login" class="text-foreground underline">{t('auth.sign_in')}</a>
</p>
