<script lang="ts">
	import { enhance } from '$app/forms';

	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>{t('auth.reset_title')}</title></svelte:head>

<h1 class="text-xl font-semibold tracking-tight">{t('auth.reset_title')}</h1>
<p class="text-muted-foreground mt-1 mb-6 text-sm">{t('auth.reset_subtitle')}</p>

{#if form?.done}
	<p role="status" class="border-border bg-muted/40 mb-4 border px-3 py-3 text-sm">
		{t('auth.reset_done')}
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
		<input type="hidden" name="token" value={data.token} />

		<div>
			<label for="password" class="mb-1.5 block text-sm font-medium">
				{t('auth.new_password')}
			</label>
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

		<Button type="submit" class="w-full" disabled={submitting}>
			{t('auth.reset_submit')}
		</Button>
	</form>

	<p class="mt-6 text-center text-sm">
		<a href="/login" class="text-muted-foreground underline">{t('auth.back_to_login')}</a>
	</p>
{/if}
