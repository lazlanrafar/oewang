<script lang="ts">
	/**
	 * A vault file's own sheet (D90, VLT-7).
	 *
	 * The old app had two halves of this: `FilePreviewSheet`, whose header
	 * (name, format, open, download, close) is the header here, and the
	 * vault page's detail panel, whose preview box, metadata, tags and footer
	 * are the body. The sheet opens from a vault tile and, stacked over the
	 * detail sheet, from an attachment tile on a transaction.
	 *
	 * Fixed against the old panel: rename works, Delete asks first and says
	 * how many transactions lose the file, and the transactions that carry it
	 * are listed. The "Dimensions" row is gone; it only ever said N/A.
	 */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Download from '@lucide/svelte/icons/download';
	import Edit3 from '@lucide/svelte/icons/pen-line';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Tag from '@lucide/svelte/icons/tag';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';

	import { Badge } from '../../atoms/badge/index.js';
	import { Button } from '../../atoms/button/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { ScrollArea } from '../../atoms/scroll-area/index.js';
	import { Separator } from '../../atoms/separator/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import { ConfirmDialog } from '../../molecules/confirm-dialog/index.js';
	import { FilePreview } from '../../molecules/file-preview/index.js';
	import { filePreview, formatBytes, formatOf, type VaultFileDetail } from '$lib/files.js';
	import { t, type TranslationKey } from '$lib/i18n';
	import { formatMoney } from '$lib/money.js';
	import { deleteVaultFile, saveVaultFile } from '$lib/vault.js';

	let {
		open = $bindable(false),
		onOpenChange,
		file,
		canEdit = true,
		onChanged,
		onDeleted
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		file: VaultFileDetail | null;
		canEdit?: boolean;
		/** A rename or a tag change landed: the page reloads what it shows. */
		onChanged: () => void | Promise<void>;
		/** The file is gone: the page closes this sheet. */
		onDeleted: () => void | Promise<void>;
	} = $props();

	const SUGGESTED: TranslationKey[] = [
		'vault.suggested.invoice',
		'vault.suggested.transaction',
		'vault.suggested.receipt',
		'vault.suggested.report',
		'vault.suggested.contract',
		'vault.suggested.document'
	];

	const preview = filePreview();
	let objectUrl = $state<string | null>(null);
	let tagInput = $state('');
	let renaming = $state(false);
	let nameInput = $state('');
	let confirmDelete = $state(false);
	let busy = $state(false);

	// A different file is a fresh sheet: no half-typed tag or name carries over.
	$effect(() => {
		void file?.id;
		tagInput = '';
		renaming = false;
	});

	const suggested = $derived(
		SUGGESTED.map((key) => t(key)).filter((tag) => !file?.tags.includes(tag))
	);

	async function saveTags(tags: string[]) {
		if (!file) return;
		busy = true;
		const result = await saveVaultFile(file.id, { tags });
		busy = false;
		if (result.ok) {
			toast.success(t('vault.toasts.tags_update_success'));
			await onChanged();
		} else {
			toast.error(t('vault.toasts.tags_update_failed'));
		}
	}

	function addTag(tag: string) {
		if (!file) return;
		const clean = tag.trim();
		if (!clean || file.tags.includes(clean)) return;
		tagInput = '';
		saveTags([...file.tags, clean]);
	}

	function removeTag(tag: string) {
		if (!file) return;
		saveTags(file.tags.filter((candidate) => candidate !== tag));
	}

	function startRename() {
		if (!file) return;
		nameInput = file.name;
		renaming = true;
	}

	async function rename() {
		if (!file) return;
		const name = nameInput.trim();
		renaming = false;
		if (!name || name === file.name) return;

		const result = await saveVaultFile(file.id, { name });
		if (result.ok) {
			toast.success(t('vault.toasts.rename_success'));
			await onChanged();
		} else {
			toast.error(t('vault.toasts.rename_failed'));
		}
	}

	async function remove() {
		if (!file) return;
		const result = await deleteVaultFile(file.id);
		if (result.ok) {
			toast.success(t('vault.toasts.delete_success'));
			await onDeleted();
		} else {
			toast.error(t('vault.toasts.delete_failed'));
		}
	}

	function download() {
		if (!objectUrl || !file) return;
		const link = document.createElement('a');
		link.href = objectUrl;
		link.download = file.name;
		link.click();
	}

	function openOriginal() {
		if (objectUrl) window.open(objectUrl, '_blank', 'noopener');
	}

	const transactionLabel = (row: VaultFileDetail['transactions'][number]) =>
		row.name || t('vault.details.untitled');
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		{#if file}
			<Sheet.Header
				class="flex shrink-0 flex-row items-center justify-between space-y-0 border-b p-6"
			>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<Sheet.Title class="truncate pr-4 font-medium text-sm">{file.name}</Sheet.Title>
					<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
						{formatOf(file.type)}
					</p>
					<Sheet.Description class="sr-only">{t('vault.details.title')}</Sheet.Description>
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8 rounded-full"
						title={t('files.open_new_tab')}
						aria-label={t('files.open_new_tab')}
						disabled={!objectUrl}
						onclick={openOriginal}
					>
						<ExternalLink class="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8 rounded-full"
						title={t('files.download_short')}
						aria-label={t('files.download_short')}
						disabled={!objectUrl}
						onclick={download}
					>
						<Download class="h-4 w-4" />
					</Button>
					<Sheet.Close>
						{#snippet child({ props })}
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 rounded-full"
								aria-label={t('files.close')}
								{...props}
							>
								<X class="h-4 w-4" />
							</Button>
						{/snippet}
					</Sheet.Close>
				</div>
			</Sheet.Header>

			<ScrollArea class="h-full min-h-0 flex-1">
				<div class="space-y-6 p-6">
					{#key file.id}
						<FilePreview {file} bind:objectUrl variant="box" {...preview} />
					{/key}

					<div class="space-y-4">
						{#if renaming}
							<form
								onsubmit={(event) => {
									event.preventDefault();
									rename();
								}}
							>
								<Input
									bind:value={nameInput}
									aria-label={t('vault.details.rename_label')}
									class="h-8 text-sm"
									maxlength={200}
									autofocus
									onblur={rename}
									onkeydown={(event) => {
										if (event.key === 'Escape') {
											event.stopPropagation();
											renaming = false;
										}
									}}
								/>
							</form>
						{:else}
							<div class="group flex items-start justify-between">
								<h3 class="break-all font-bold text-lg leading-tight">{file.name}</h3>
								{#if canEdit}
									<Button
										variant="ghost"
										size="icon"
										class="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
										aria-label={t('vault.details.rename')}
										onclick={startRename}
									>
										<Edit3 class="h-4 w-4" />
									</Button>
								{/if}
							</div>
						{/if}

						<div class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
							<span class="text-muted-foreground">{t('vault.details.date_created')}</span>
							<span class="font-medium">{new Date(file.created_at).toLocaleString()}</span>

							<span class="text-muted-foreground">{t('vault.details.format')}</span>
							<span class="font-medium text-primary uppercase">{formatOf(file.type)}</span>

							<span class="text-muted-foreground">{t('vault.details.file_size')}</span>
							<span class="font-medium">{formatBytes(file.size)}</span>
						</div>

						<Separator />

						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 font-semibold text-sm">
									<Tag class="h-4 w-4" aria-hidden="true" />
									{t('vault.details.tags')}
								</div>
							</div>

							<div class="flex min-h-[32px] flex-wrap gap-1.5">
								{#each file.tags as tag (tag)}
									<Badge variant="tag">
										{tag}
										{#if canEdit}
											<button
												type="button"
												class="shrink-0 hover:text-destructive"
												aria-label={t('vault.details.remove_tag', { tag })}
												disabled={busy}
												onclick={() => removeTag(tag)}
											>
												<X class="h-3 w-3" />
											</button>
										{/if}
									</Badge>
								{:else}
									<p class="text-muted-foreground text-xs italic">{t('vault.details.no_tags')}</p>
								{/each}
							</div>

							{#if canEdit}
								<div class="space-y-2">
									<p class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
										{t('vault.details.suggested_tags')}
									</p>
									<div class="flex flex-wrap gap-1.5">
										{#each suggested as tag (tag)}
											<button
												type="button"
												disabled={busy}
												class="rounded-full border border-dashed bg-muted/30 px-2 py-1 text-[10px] transition-colors hover:border-primary hover:text-primary"
												onclick={() => addTag(tag)}
											>
												+ {tag}
											</button>
										{/each}
									</div>
								</div>

								<div class="relative mt-2">
									<Input
										bind:value={tagInput}
										placeholder={t('vault.details.add_custom_tag')}
										aria-label={t('vault.details.add_custom_tag')}
										maxlength={32}
										class="h-8 pr-12 text-xs"
										onkeydown={(event) => {
											if (event.key === 'Enter') {
												event.preventDefault();
												addTag(tagInput);
											}
										}}
									/>
									<Button
										size="sm"
										variant="ghost"
										class="absolute top-1 right-1 h-6 w-10 p-0 text-[10px]"
										disabled={busy}
										onclick={() => addTag(tagInput)}
									>
										{t('vault.details.add_tag_button')}
									</Button>
								</div>
							{/if}
						</div>

						<Separator />

						<div class="space-y-3">
							<div class="flex items-center justify-between font-semibold text-sm">
								<span>{t('vault.details.transactions')}</span>
								<span class="text-muted-foreground text-xs tabular-nums">{file.used_by}</span>
							</div>
							{#if file.transactions.length > 0}
								<ul class="divide-y border">
									{#each file.transactions as row (row.id)}
										<li>
											<a
												href={`/transactions?detail=${encodeURIComponent(row.id)}`}
												class="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
											>
												<span class="min-w-0">
													<span class="block truncate font-medium">{transactionLabel(row)}</span>
													<span class="block text-muted-foreground text-xs">
														{new Date(row.date).toLocaleDateString()}
													</span>
												</span>
												<span class="shrink-0 tabular-nums">
													{formatMoney(row.amount, row.currency_code)}
												</span>
											</a>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="text-muted-foreground text-xs italic">
									{t('vault.details.no_transactions')}
								</p>
							{/if}
						</div>
					</div>
				</div>
			</ScrollArea>

			<div class="mt-auto grid shrink-0 grid-cols-2 gap-3 border-t bg-muted/5 p-4">
				<div class="flex w-full items-center gap-0.5">
					<Button
						variant="outline"
						class="h-9 flex-1 rounded-r-none text-xs"
						disabled={!objectUrl}
						onclick={openOriginal}
					>
						<Download class="mr-2 h-4 w-4" />
						{t('vault.details.view_full')}
					</Button>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									variant="outline"
									class="h-9 rounded-l-none border-l-0 px-2"
									aria-label={t('vault.details.more_actions')}
									disabled={!objectUrl}
									{...props}
								>
									<ChevronDown class="h-4 w-4" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onSelect={openOriginal}>
								<ExternalLink class="mr-2 h-4 w-4" />
								{t('vault.details.open_original')}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={download}>
								<Download class="mr-2 h-4 w-4" />
								{t('vault.details.download_local')}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
				{#if canEdit}
					<Button
						variant="outline-destructive"
						class="h-9 text-xs"
						onclick={() => (confirmDelete = true)}
					>
						<Trash2 class="mr-2 h-4 w-4" />
						{t('vault.details.delete')}
					</Button>
				{/if}
			</div>
		{:else}
			<Sheet.Header class="border-b p-6">
				<Sheet.Title class="font-medium text-sm">{t('vault.details.title')}</Sheet.Title>
			</Sheet.Header>
			<p class="p-6 text-muted-foreground text-sm">{t('vault.details.missing')}</p>
		{/if}
	</Sheet.Content>
</Sheet.Root>

{#if file}
	<ConfirmDialog
		bind:open={confirmDelete}
		title={t('vault.delete_confirm.title', { name: file.name })}
		description={file.used_by > 0
			? `${t('vault.delete_confirm.description')} ${t('vault.delete_confirm.used', { count: file.used_by })}`
			: t('vault.delete_confirm.description')}
		confirmLabel={t('vault.delete_confirm.confirm')}
		onConfirm={remove}
	/>
{/if}
