<script lang="ts">
	/**
	 * What the assistant is told (CHAT-10, US-032). It was a tab on the
	 * settings page and is a settings section since D82; the form and its
	 * rules are unchanged.
	 */
	import { enhance, type SubmitFunction } from '$app/forms';

	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import { NativeSelect } from '$lib/components/atoms/native-select';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import {
		instructionsRemaining,
		instructionsWithinLimit,
		languageLabelKey,
		RESPONSE_LANGUAGES,
		toResponseLanguage
	} from '$lib/ai-settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.me.role !== 'member');

	/*
	 * The instructions are held here rather than read off the form, because
	 * the counter has to move as the user types. The stored value is
	 * written back whenever the page reloads its data, which is what a
	 * successful save does.
	 */
	let instructions = $state('');
	let saved = $state(false);

	$effect(() => {
		instructions = data.assistant?.custom_instructions ?? '';
	});

	const remaining = $derived(instructionsRemaining(instructions));
	const tooLong = $derived(!instructionsWithinLimit(instructions));
	const responseLanguage = $derived(toResponseLanguage(data.assistant?.response_language));

	/** Confirm the save where the user is looking, rather than at the top. */
	const markSaved: SubmitFunction = () => {
		return async ({ result, update }) => {
			saved = result.type === 'success';
			await update();
		};
	};
</script>

<svelte:head>
	<title>{t('settings.assistant_title')} · {t('settings.title')} · {t('app.name')}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader
		title={t('settings.assistant_title')}
		description={t('settings.assistant_description')}
	/>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	{#if !data.assistant}
		<!-- The read failed. Showing an empty form would invite an admin to
		     save "nothing set" over instructions that are in force. -->
		<p class="text-destructive text-small max-w-xl" role="alert">
			{t('settings.assistant_unavailable')}
		</p>
	{:else if canEdit}
		<form
			method="POST"
			action="?/updateAssistant"
			use:enhance={markSaved}
			class="max-w-xl space-y-6 border p-4"
		>
			<div class="grid gap-2">
				<Label for="assistant-instructions" class="text-subtle text-xs font-normal">
					{t('settings.instructions_label')}
				</Label>
				<Textarea
					id="assistant-instructions"
					name="custom_instructions"
					rows={6}
					bind:value={instructions}
					oninput={() => (saved = false)}
					placeholder={t('settings.instructions_placeholder')}
					aria-describedby="assistant-instructions-hint assistant-instructions-count"
					aria-invalid={tooLong || form?.fields?.custom_instructions ? 'true' : undefined}
				/>
				<p id="assistant-instructions-hint" class="text-subtle text-xs">
					{t('settings.instructions_hint')}
				</p>
				<!-- The count is announced, because the reason the save button
				     is disabled has to reach a reader who cannot see it. -->
				<p
					id="assistant-instructions-count"
					class="text-xs {tooLong ? 'text-destructive' : 'text-subtle'}"
					aria-live="polite"
				>
					{tooLong
						? t('settings.instructions_over', { count: -remaining })
						: t('settings.instructions_remaining', { count: remaining })}
				</p>
				<FieldError message={form?.fields?.custom_instructions} />
			</div>

			<div class="grid gap-2">
				<Label for="assistant-language" class="text-subtle text-xs font-normal">
					{t('settings.language_label')}
				</Label>
				<!-- A list fixed in the source, so the native select (D79), and
				     the form submits without JavaScript. -->
				<NativeSelect id="assistant-language" name="response_language">
					{#each RESPONSE_LANGUAGES as language (language)}
						<option value={language} selected={language === responseLanguage}>
							{t(languageLabelKey(language))}
						</option>
					{/each}
				</NativeSelect>
				<p class="text-subtle text-xs">{t('settings.language_hint')}</p>
				<FieldError message={form?.fields?.response_language} />
			</div>

			<div class="flex items-center gap-3">
				<Button type="submit" disabled={tooLong}>{t('common.save')}</Button>
				{#if saved}
					<p class="text-subtle text-xs" role="status">{t('settings.saved')}</p>
				{/if}
			</div>
		</form>
	{:else}
		<!-- A member sees what the assistant has been told, and why they
		     cannot change it. A disabled field with no explanation reads as
		     a broken page (UI-7). -->
		<div class="max-w-xl space-y-4 border p-4">
			<p class="text-subtle text-small">{t('settings.assistant_read_only')}</p>

			<div class="grid gap-1">
				<h2 class="text-subtle text-xs">{t('settings.instructions_label')}</h2>
				{#if data.assistant.custom_instructions}
					<p class="text-small whitespace-pre-wrap">{data.assistant.custom_instructions}</p>
				{:else}
					<p class="text-subtle text-small">{t('settings.instructions_empty')}</p>
				{/if}
			</div>

			<div class="grid gap-1">
				<h2 class="text-subtle text-xs">{t('settings.language_label')}</h2>
				<p class="text-small">{t(languageLabelKey(responseLanguage))}</p>
			</div>
		</div>
	{/if}
</div>
