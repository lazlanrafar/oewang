<script lang="ts">
	/**
	 * Ported from the old app's contact-form-sheet, in the SHEET_GUIDE layout
	 * the budget sheet uses: content at `p-0`, a header with no rule, a body
	 * with `pb-[100px]`, one full-width submit over it (CON-1).
	 *
	 * It posts to the contacts page's action; the page passes `enhance`.
	 */
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { t } from '$lib/i18n';
	import type { Contact } from '$lib/server/contacts';

	import ContactsFormFields from './contacts-form-fields.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		contact = null,
		saving = false,
		fieldErrors,
		enhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		contact?: Contact | null;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const progressive = (node: HTMLFormElement) => enhance?.(node);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<form
			method="POST"
			action={contact ? '?/update' : '?/create'}
			use:progressive
			class="flex h-full flex-col"
		>
			{#if contact}
				<input type="hidden" name="id" value={contact.id} />
			{/if}

			<Sheet.Header class="shrink-0 px-6 pt-6">
				<Sheet.Title class="text-lg">
					{contact ? t('contacts.form.edit_title') : t('contacts.form.add_title')}
				</Sheet.Title>
				<Sheet.Description class="sr-only">{t('contacts.form.description_sr')}</Sheet.Description>
			</Sheet.Header>

			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
				<!-- Keyed, so the uncontrolled inputs start again for each contact. -->
				{#key contact?.id ?? 'new'}
					<ContactsFormFields {contact} prefix="contact-form" {fieldErrors} />
				{/key}
			</div>

			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button type="submit" class="w-full" loading={saving}>
					{contact ? t('contacts.form.save') : t('contacts.form.create')}
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
