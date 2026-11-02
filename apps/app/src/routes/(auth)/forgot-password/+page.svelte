<script lang="ts">
	import { enhance } from '$app/forms';

	import FieldError from '$lib/components/shell/field-error.svelte';
	import FormError from '$lib/components/shell/form-error.svelte';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>{t('auth.forgot_title')}</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">{t('auth.forgot_title')}</h1>
<p class="text-muted-foreground mt-1 mb-6 text-sm">{t('auth.forgot_subtitle')}</p>

{#if form?.sent}
	<p role="status" class="border-border bg-muted/40 mb-4 border px-3 py-3 text-sm">
		{t('auth.forgot_sent')}
	</p>
	<a href="/login" class="text-sm underline">{t('auth.back_to_login')}</a>
{:else}
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
			<Input id="email" name="email" type="email" autocomplete="email" required />
			<FieldError message={form?.fields?.email} />
		</div>

		<Button type="submit" class="w-full" disabled={submitting}>
			{t('auth.forgot_submit')}
		</Button>
	</form>

	<p class="mt-6 text-center text-sm">
		<a href="/login" class="text-muted-foreground underline">{t('auth.back_to_login')}</a>
	</p>
{/if}
