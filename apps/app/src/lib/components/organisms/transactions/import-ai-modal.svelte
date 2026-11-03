<script lang="ts">
	/**
	 * Importing a statement that has no columns (AI-4, TXN-16, TXN-17).
	 *
	 * The deterministic path maps a CSV's columns and never shows the model
	 * a row. An image or a PDF has no columns to map, so the model reads the
	 * rows instead, in a background job this modal watches
	 * (docs/features/transactions.md#image-and-pdf-statement).
	 *
	 * It holds no fetch. The page owns the upload, the start and the poll,
	 * and hands the job down; this renders the four states a job can be in
	 * and the one decision the user makes in each.
	 *
	 * Ported from the old `transaction-import-ai-modal` plus its review
	 * component, 371 lines between them. The counts, the stale retry and
	 * the wallet are what came along.
	 */
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { needsAttention, type ImportJob, type ImportPhase } from '$lib/import-job.js';
	import { messageForCode } from '$lib/errors.js';
	import { t } from '$lib/i18n';

	import { Button } from '../../atoms/button/index.js';
	import * as Dialog from '../../atoms/dialog/index.js';
	import { Label } from '../../atoms/label/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { FileDropzone, type UploadedFile } from '../../molecules/file-dropzone/index.js';

	let {
		open = $bindable(false),
		onOpenChange,
		wallets,
		walletId = $bindable(''),
		files = $bindable([]),
		job = null,
		phase = null,
		starting = false,
		errorCode = null,
		onStart,
		onRetry,
		onClose
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		wallets: Array<{ id: string; name: string; currency_code: string }>;
		/** Every row lands here, so a statement is an account's statement. */
		walletId?: string;
		/** The uploaded statement. One file: one statement, one job. */
		files?: UploadedFile[];
		job?: ImportJob | null;
		phase?: ImportPhase | null;
		starting?: boolean;
		/** A failure before the job existed, such as a refused upload. */
		errorCode?: string | null;
		onStart: () => void;
		onRetry: () => void;
		onClose: () => void;
	} = $props();

	const selectClass = 'border-input bg-background h-9 w-full border px-3 text-sm';

	/** Nothing to start without a wallet and a file. */
	const startable = $derived(walletId !== '' && files.length > 0 && !starting);
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{t('import.ai_title')}</Dialog.Title>
			<Dialog.Description>{t('import.ai_subtitle')}</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			{#if phase === null}
				<!-- Before the job: which wallet, and which file. -->
				<div class="grid gap-2">
					<Label for="ai-import-wallet" class="text-subtle text-xs font-normal">
						{t('import.wallet')}
					</Label>
					<select id="ai-import-wallet" class={selectClass} bind:value={walletId}>
						{#each wallets as wallet (wallet.id)}
							<option value={wallet.id}>{wallet.name} · {wallet.currency_code}</option>
						{/each}
					</select>
					<p class="text-subtle text-xs">{t('import.wallet_hint')}</p>
				</div>

				<div class="grid gap-2">
					<Label class="text-subtle text-xs font-normal">{t('import.ai_file')}</Label>
					<FileDropzone bind:files disabled={starting} />
					<p class="text-subtle text-xs">{t('import.ai_file_hint')}</p>
				</div>

				{#if errorCode}
					<p class="text-destructive text-small" role="alert">{messageForCode(errorCode)}</p>
				{/if}
			{:else if phase === 'pending'}
				<!-- Polling. The wall-clock budget is looser here than for a
				     receipt, because nobody is watching the model work. -->
				<div class="flex items-center gap-3 py-6">
					<Spinner class="size-4" />
					<p class="text-small" aria-live="polite">{t('import.ai_working')}</p>
				</div>
			{:else if phase === 'stale'}
				<!-- Ten minutes is long enough to call it. The file is still
				     in the vault, so a retry does not re-upload it (P12). -->
				<div class="space-y-3 py-4">
					<div class="flex items-center gap-2">
						<TriangleAlert class="text-subtle size-4" aria-hidden="true" />
						<p class="text-small">{t('import.ai_stale')}</p>
					</div>
					<p class="text-subtle text-xs">{t('import.ai_stale_hint')}</p>
				</div>
			{:else if phase === 'failed'}
				<div class="space-y-3 py-4">
					<p class="text-small" role="alert">{t('import.ai_failed')}</p>
					{#if job?.error}
						<p class="text-subtle text-xs">{messageForCode(job.error)}</p>
					{/if}
				</div>
			{:else if job}
				<!-- Imported, duplicate and skipped are counted apart, because
				     the fix for each one is different (TXN-16). -->
				<div class="space-y-4 py-2">
					<div class="flex items-center gap-2">
						<CircleCheck class="text-subtle size-4" aria-hidden="true" />
						<p class="text-small">{t('import.ai_done')}</p>
					</div>

					<dl class="grid grid-cols-3 gap-4 text-center">
						<div>
							<dt class="text-subtle text-xs tracking-widest uppercase">
								{t('import.created')}
							</dt>
							<dd class="font-serif text-3xl">{job.imported}</dd>
						</div>
						<div>
							<dt class="text-subtle text-xs tracking-widest uppercase">
								{t('import.duplicates')}
							</dt>
							<dd class="font-serif text-3xl">{job.duplicates}</dd>
						</div>
						<div>
							<dt class="text-subtle text-xs tracking-widest uppercase">
								{t('import.skipped')}
							</dt>
							<dd class="font-serif text-3xl">{job.skipped}</dd>
						</div>
					</dl>

					{#if job.skipped > 0}
						<p class="text-subtle text-xs">{t('import.ai_skipped_hint')}</p>
					{/if}

					{#if job.review && job.review.rows.length > 0}
						<!--
							The rows the model read, in file order, with the ones
							worth a second look marked. The figures are its own
							strings: nothing here re-parses an amount (D28).
						-->
						<div class="space-y-1">
							<p class="text-subtle text-xs tracking-widest uppercase">
								{t('import.ai_review')}
							</p>

							<ul class="max-h-64 divide-y overflow-y-auto border text-xs">
								{#each job.review.rows as row, index (index)}
									<li class="flex items-baseline gap-2 px-3 py-1.5">
										<span class="text-subtle w-20 shrink-0 font-mono">
											{row.date || t('import.ai_row_no_date')}
										</span>
										<span class="min-w-0 flex-1 truncate">
											{row.name || t('import.ai_row_no_name')}
										</span>
										<span class="shrink-0 font-mono">{row.amount}</span>
										<span class="text-subtle w-20 shrink-0 text-right">
											{t(`import.ai_row_${row.status}` as 'import.ai_row_imported')}
										</span>
										{#if needsAttention(row)}
											<TriangleAlert
												class="text-subtle size-3 shrink-0"
												aria-label={t('import.ai_row_check')}
											/>
										{/if}
									</li>
								{/each}
							</ul>

							{#if job.review.truncated}
								<!-- The list was cut, the counts were not. Saying
								     only the first half would be worse than saying
								     neither. -->
								<p class="text-subtle text-xs">
									{t('import.ai_review_truncated', { shown: job.review.rows.length })}
								</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			{#if phase === null}
				<Button type="button" variant="outline" onclick={onClose}>{t('common.cancel')}</Button>
				<Button type="button" disabled={!startable} loading={starting} onclick={onStart}>
					{t('import.ai_start')}
				</Button>
			{:else if phase === 'pending'}
				<!-- Closing stops the watching, not the job. It carries on. -->
				<Button type="button" variant="outline" onclick={onClose}>
					{t('import.ai_close')}
				</Button>
			{:else if phase === 'stale' || phase === 'failed'}
				<Button type="button" variant="outline" onclick={onClose}>{t('common.close')}</Button>
				<Button type="button" onclick={onRetry}>{t('common.retry')}</Button>
			{:else}
				<Button type="button" onclick={onClose}>{t('import.done')}</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
