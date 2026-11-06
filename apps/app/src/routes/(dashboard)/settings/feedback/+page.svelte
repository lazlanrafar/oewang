<script lang="ts">
	/**
	 * Feedback (FB-1, D104), the old feedback form: a type and a message. No
	 * screenshot, which would need a file path through the vault for one
	 * field; the message is what gets read.
	 */
	import { enhance } from '$app/forms';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import { NativeSelect } from '$lib/components/atoms/native-select';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	/** The API's cap, so the count runs out where the API would refuse. */
	const MAX = 5000;

	let message = $state('');
	let sending = $state(false);

	const labelClass = 'text-subtle text-xs font-normal';
</script>

<svelte:head>
	<title>{pageTitle(t('settings.feedback_title'), t('settings.title'))}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader
		title={t('settings.feedback_title')}
		description={t('settings.feedback_description')}
	/>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<form
		method="POST"
		action="?/send"
		class="space-y-6"
		use:enhance={() => {
			sending = true;
			return async ({ result, update }) => {
				sending = false;
				if (result.type === 'success') {
					toast.success(t('settings.feedback_sent'));
					message = '';
				}
				await update();
			};
		}}
	>
		<div class="grid gap-2">
			<Label for="feedback-type" class={labelClass}>{t('settings.feedback_type_label')}</Label>
			<NativeSelect id="feedback-type" name="type" value="bug">
				<option value="bug">{t('settings.feedback_type_bug')}</option>
				<option value="feature">{t('settings.feedback_type_feature')}</option>
				<option value="other">{t('settings.feedback_type_other')}</option>
			</NativeSelect>
			<FieldError message={form?.fields?.type} />
		</div>

		<div class="grid gap-2">
			<Label for="feedback-message" class={labelClass}>{t('settings.feedback_message_label')}</Label>
			<Textarea
				id="feedback-message"
				name="message"
				rows={6}
				required
				maxlength={MAX}
				bind:value={message}
				placeholder={t('settings.feedback_message_placeholder')}
			/>
			<p class="text-subtle text-xs">
				{t('settings.feedback_remaining', { count: MAX - message.length })}
			</p>
			<FieldError message={form?.fields?.message} />
		</div>

		<Button type="submit" loading={sending} disabled={!message.trim()}>
			{t('settings.feedback_send')}
		</Button>
	</form>
</div>
