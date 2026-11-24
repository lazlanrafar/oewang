<script lang="ts">
	/**
	 * A contact's four fields, shared by the form sheet and the detail
	 * sheet's quick edit (CON-1): name, then email and phone side by side,
	 * then notes. The old form's address, VAT, website and billing fields
	 * are not carried (D120). Each input carries its own name, so the
	 * fields post with no hidden copies.
	 */
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { t } from '$lib/i18n';
	import type { Contact } from '$lib/server/contacts';

	let {
		contact = null,
		prefix,
		fieldErrors
	}: {
		/** The contact being edited, or null for a new one. */
		contact?: Contact | null;
		/** Keeps two copies of these fields on one page from sharing ids. */
		prefix: string;
		fieldErrors?: Record<string, string>;
	} = $props();

	const labelClass = 'text-muted-foreground text-xs font-normal';
</script>

<div class="space-y-6">
	<div class="grid gap-2">
		<Label for="{prefix}-name" class={labelClass}>{t('contacts.form.name_label')}</Label>
		<Input
			id="{prefix}-name"
			name="name"
			required
			value={contact?.name ?? ''}
			placeholder={t('contacts.form.name_placeholder')}
			autocomplete="off"
		/>
		<FieldError message={fieldErrors?.name} />
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div class="grid gap-2">
			<Label for="{prefix}-email" class={labelClass}>{t('contacts.form.email_label')}</Label>
			<Input
				id="{prefix}-email"
				name="email"
				type="email"
				value={contact?.email ?? ''}
				placeholder={t('contacts.form.email_placeholder')}
			/>
			<FieldError message={fieldErrors?.email} />
		</div>
		<div class="grid gap-2">
			<Label for="{prefix}-phone" class={labelClass}>{t('contacts.form.phone_label')}</Label>
			<Input
				id="{prefix}-phone"
				name="phone"
				type="tel"
				value={contact?.phone ?? ''}
				placeholder={t('contacts.form.phone_placeholder')}
			/>
			<FieldError message={fieldErrors?.phone} />
		</div>
	</div>

	<div class="grid gap-2">
		<Label for="{prefix}-note" class={labelClass}>{t('contacts.form.notes_label')}</Label>
		<Textarea
			id="{prefix}-note"
			name="note"
			value={contact?.note ?? ''}
			placeholder={t('contacts.form.notes_placeholder')}
		/>
		<FieldError message={fieldErrors?.note} />
	</div>
</div>
