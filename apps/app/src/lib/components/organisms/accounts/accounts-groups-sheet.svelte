<script lang="ts">
	/**
	 * The wallet groups, managed from the accounts screen: add, rename,
	 * reorder and delete (WAL-1). The groups picker can only create one, and
	 * the Settings tab that once did the rest is gone, so this sheet is the
	 * one place a group's other writes live.
	 *
	 * The rows are the settings screen's sortable list, so a group drags and
	 * answers the arrow keys exactly as a category does. Every write is a
	 * form posted to the page's own action; the page passes `enhance`, so it
	 * decides what a save means, and the reload brings the order back.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';

	import { Button } from '$lib/components/atoms/button';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { SettingsCategoryList } from '$lib/components/organisms/settings';
	import { t } from '$lib/i18n';

	type Group = { id: string; name: string };

	let {
		open = $bindable(false),
		groups,
		canEdit = true,
		enhance
	}: {
		open?: boolean;
		groups: Group[];
		canEdit?: boolean;
		/** SvelteKit's `enhance`, from the page; `done` runs after a success. */
		enhance: (node: HTMLFormElement, done?: () => void) => void;
	} = $props();

	/* One dialog for add and rename, holding the group it is renaming. */
	let dialog = $state<{ open: boolean; group: Group | null }>({ open: false, group: null });
	let pendingDelete = $state<{ open: boolean; group: Group | null }>({
		open: false,
		group: null
	});
	let deleteForm = $state<HTMLFormElement | null>(null);

	/*
	 * A reorder is posted once the rows stop moving, not per arrow press, so
	 * two requests cannot race each other's writes.
	 */
	let reorderIds = $state<string[]>([]);
	let reorderForm = $state<HTMLFormElement | null>(null);
	let reorderTimer: ReturnType<typeof setTimeout> | undefined;

	function reorder(ids: string[]) {
		clearTimeout(reorderTimer);
		reorderTimer = setTimeout(async () => {
			reorderIds = ids;
			await tick();
			reorderForm?.requestSubmit();
		}, 400);
	}

	const closeDialog = () => (dialog = { open: false, group: null });
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<Sheet.Header class="shrink-0 px-6 pt-6">
			<Sheet.Title class="text-lg">{t('accounts.groups_title')}</Sheet.Title>
			<Sheet.Description>{t('accounts.groups_description')}</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pt-6 pb-6">
			{#if canEdit}
				<div class="flex justify-end">
					<Button size="sm" onclick={() => (dialog = { open: true, group: null })}>
						<Plus class="size-3.5" />
						{t('accounts.new_group')}
					</Button>
				</div>
			{/if}

			<SettingsCategoryList
				categories={groups}
				label={t('accounts.groups_title')}
				{canEdit}
				empty={t('accounts.groups_empty')}
				deleteLabel={t('accounts.delete_group')}
				onReorder={reorder}
				onEditRow={(group) => (dialog = { open: true, group })}
				onDeleteRow={(group) => (pendingDelete = { open: true, group })}
			/>
		</div>
	</Sheet.Content>
</Sheet.Root>

<Dialog.Root bind:open={dialog.open}>
	<Dialog.Content class="sm:max-w-sm">
		<form
			method="POST"
			action={dialog.group ? '?/updateGroup' : '?/createGroup'}
			use:enhance={closeDialog}
		>
			<Dialog.Header>
				<Dialog.Title>
					{dialog.group ? t('accounts.edit_group') : t('accounts.new_group')}
				</Dialog.Title>
				<Dialog.Description class="sr-only">{t('accounts.groups_description')}</Dialog.Description>
			</Dialog.Header>

			{#if dialog.group}
				<input type="hidden" name="id" value={dialog.group.id} />
			{/if}

			<div class="grid gap-2 py-4">
				<Label for="group-name" class="text-subtle text-xs font-normal">{t('common.name')}</Label>
				<Input
					id="group-name"
					name="name"
					required
					value={dialog.group?.name ?? ''}
					placeholder={t('accounts.group_name_placeholder')}
				/>
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={pendingDelete.open}
	title={t('accounts.delete_group')}
	description={t('accounts.delete_group_confirm', { name: pendingDelete.group?.name ?? '' })}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>

<form bind:this={deleteForm} method="POST" action="?/deleteGroup" class="hidden" use:enhance>
	<input type="hidden" name="id" value={pendingDelete.group?.id ?? ''} />
</form>

<!-- The order a drag or an arrow key settled on, top first. -->
<form bind:this={reorderForm} method="POST" action="?/reorderGroups" class="hidden" use:enhance>
	{#each reorderIds as id (id)}
		<input type="hidden" name="ids" value={id} />
	{/each}
</form>
