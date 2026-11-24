<script lang="ts">
	/**
	 * Merge one contact into another (CON-4): every debt moves to the one
	 * picked, and the first is removed, in one write. The fix for the same
	 * person entered twice, which the assistant's name matching can make.
	 *
	 * New: the old app had no merge. The picker leaves out the contact being
	 * merged, so a merge into itself cannot be chosen (`CONTACT_MERGE_SELF`).
	 */
	import { Button } from '$lib/components/atoms/button';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { SelectContact } from '$lib/components/molecules/select-contact';
	import { t } from '$lib/i18n';

	let {
		open = $bindable(false),
		contact,
		saving = false,
		enhance
	}: {
		open?: boolean;
		contact: { id: string; name: string } | null;
		saving?: boolean;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	let intoId = $state('');
	$effect(() => {
		if (open) intoId = '';
	});

	const progressive = (node: HTMLFormElement) => enhance?.(node);
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		{#if contact}
			<form method="POST" action="/contacts?/merge" use:progressive class="grid gap-4">
				<input type="hidden" name="id" value={contact.id} />
				<input type="hidden" name="into_id" value={intoId} />
				<Dialog.Header>
					<Dialog.Title>{t('contacts.merge.title', { name: contact.name })}</Dialog.Title>
					<Dialog.Description>{t('contacts.merge.description', { name: contact.name })}</Dialog.Description>
				</Dialog.Header>
				<SelectContact
					bind:value={intoId}
					exclude={[contact.id]}
					placeholder={t('contacts.merge.placeholder')}
				/>
				<Dialog.Footer>
					<Button variant="outline" type="button" onclick={() => (open = false)}>
						{t('common.cancel')}
					</Button>
					<Button type="submit" loading={saving} disabled={!intoId}>{t('contacts.merge.confirm')}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
