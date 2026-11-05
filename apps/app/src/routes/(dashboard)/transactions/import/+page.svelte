<script lang="ts">
	/**
	 * The CSV import wizard (TXN-11, D28).
	 *
	 * Four steps, ported from the old wizard: pick a file, map the columns,
	 * match the values, review and commit. The step lives in `?step=` so a
	 * reload lands where the user was (UI-8).
	 *
	 * The browser reads the file's shape and nothing else: column names and
	 * cell text. Every figure and every date is parsed in Rust, which is why
	 * the commit sends the rows as they came out of the file rather than as
	 * transactions. The model, when it is available, maps column names once
	 * and never sees a row.
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import FileUp from '@lucide/svelte/icons/file-up';

	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import type { UploadedFile } from '$lib/components/molecules/file-dropzone';
	import { ImportAiModal } from '$lib/components/organisms/transactions';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SelectAccount } from '$lib/components/molecules/select-account';
	import { SelectCategory } from '$lib/components/molecules/select-category';
	import { NO_COLUMN, SelectColumn } from '$lib/components/molecules/select-column';
	import {
		cleanMapping,
		isMappable,
		MAPPING_FIELDS,
		type ColumnMapping,
		type MappingField
	} from '$lib/column-mapping';
	import { parseDelimited, type ParsedFile } from '$lib/csv';
	import { messageForCode } from '$lib/errors';
	import { t, type TranslationKey } from '$lib/i18n';
	import {
		IMPORT_POLL_INTERVAL,
		isSettled,
		jobPhase,
		parseImportJob,
		type ImportJob
	} from '$lib/import-job';
	import { readParam, writeParams } from '$lib/url-state';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const STEPS = ['file', 'columns', 'values', 'review'] as const;
	const step = $derived(readParam(page.url, 'step', STEPS, 'file'));

	/** Only the date is required; the figure can be one column or two. */
	const REQUIRED: readonly MappingField[] = ['date'];

	const fieldLabel = (field: MappingField) => t(`import.field_${field}` as TranslationKey);

	let file = $state<ParsedFile>({ columns: [], rows: [], dropped: 0 });
	let fileName = $state('');
	let mapping = $state<ColumnMapping>({});
	/*
	 * The wallet every row lands in. It starts at the workspace default and
	 * follows the load until the user picks one, which is what `$state`
	 * seeded from `data` would not do.
	 */
	let chosenWallet = $state('');
	const walletId = $derived(
		chosenWallet ||
			data.wallets.find((wallet) => wallet.is_default)?.id ||
			data.wallets[0]?.id ||
			''
	);
	/*
	 * The pickers take `{ id, label }`. The wallet's currency rides along in
	 * its label, as the list showed it; "leave uncategorised" is a value
	 * rather than an absent one, so the row reads as a choice.
	 */
	const walletItems = $derived(
		data.wallets.map((wallet) => ({
			id: wallet.id,
			label: `${wallet.name} · ${wallet.currency_code}`
		}))
	);

	const UNCATEGORISED = '__uncategorised__';

	const categoryItems = $derived([
		{ id: UNCATEGORISED, label: t('import.leave_uncategorised') },
		...data.categories.map((category) => ({ id: category.id, label: category.name }))
	]);

	/** The file's category names, matched to a category in this workspace. */
	let categoryMatches = $state<Record<string, string>>({});
	let mappingPending = $state(false);
	let mappingFailed = $state(false);


	/*
	 * A reload keeps the step but not the file: the rows live in this
	 * component, and a browser will not hand back a file input's contents.
	 * Rather than show an empty step three, start again at the file.
	 */
	$effect(() => {
		if (file.rows.length === 0 && step !== 'file' && !result) writeParams({ step: null });
	});

	/** The mapping is complete enough to transform rows. */
	const mappable = $derived(isMappable(mapping));

	/** Distinct category names the file holds, as text. */
	const fileCategories = $derived(
		mapping.category
			? [...new Set(file.rows.map((row) => row[mapping.category!] ?? '').filter(Boolean))]
			: []
	);

	async function readFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const chosen = input.files?.[0];
		if (!chosen) return;

		fileName = chosen.name;
		file = parseDelimited(await chosen.text());
		mapping = {};
		categoryMatches = {};

		await writeParams({ step: 'columns' });
		await proposeMapping();
	}

	/**
	 * Ask the assistant which column holds what (AI-9, US-022).
	 *
	 * Column names and two sample rows go out; a mapping comes back. The
	 * proposal is model output, so `cleanMapping` is what decides how much
	 * of it survives: a column the file does not have never reaches the
	 * step.
	 *
	 * Every way this can go wrong goes the same way. A refusal, a timeout,
	 * a route the API has not registered yet and an empty answer all leave
	 * the step as it was and the user maps by hand. **That is the path that
	 * matters**: the model is the optional half of this step, and a wizard
	 * that waits on it is a wizard that is sometimes broken.
	 */
	async function proposeMapping() {
		if (file.columns.length === 0) return;

		mappingPending = true;
		mappingFailed = false;

		try {
			const response = await fetch('/transactions/import/map-columns', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					columns: file.columns,
					sample_rows: file.rows.slice(0, 2)
				})
			});

			if (!response.ok) throw new Error(String(response.status));

			const proposed = cleanMapping(await response.json(), file.columns);
			// An answer that mapped nothing is the same as no answer: the
			// step says so rather than looking like it worked.
			if (Object.keys(proposed).length === 0) {
				mappingFailed = true;
				return;
			}

			mapping = proposed;
		} catch {
			mappingFailed = true;
		} finally {
			mappingPending = false;
		}
	}

	/** What the commit will send, as JSON, for the hidden fields. */
	const payload = $derived({
		mapping: JSON.stringify(mapping),
		rows: JSON.stringify(file.rows),
		categories: JSON.stringify(
			Object.fromEntries(
				Object.entries(categoryMatches)
					.filter(([, id]) => id !== '')
					.map(([name, id]) => [name.toLowerCase(), id])
			)
		)
	});

	const result = $derived(form && 'result' in form ? form.result : null);

	// ------------------------------------------------ the statement path

	/**
	 * An image or a PDF, which has no columns to map (AI-4).
	 *
	 * The deterministic path above maps column names and never shows the
	 * model a row. A photograph has no columns, so the model reads the rows
	 * instead, in a job that runs in the background. Everything here is the
	 * watching: the modal is told what the job says and decides nothing.
	 */
	let statementOpen = $state(false);
	let statementFiles = $state<UploadedFile[]>([]);
	let statementWallet = $state('');
	let job = $state<ImportJob | null>(null);
	let starting = $state(false);
	let statementError = $state<string | null>(null);

	const phase = $derived(job ? jobPhase(job) : null);

	/**
	 * The job being watched.
	 *
	 * A plain variable rather than `$state`: it is the loop's own guard,
	 * and clearing it is how closing the modal stops the polling without
	 * stopping the job, which carries on in the API.
	 */
	let watching = '';

	$effect(() => {
		// The wallet follows the load until the user picks one, the same
		// way the CSV step's does.
		if (statementWallet === '') statementWallet = walletId;
	});

	/**
	 * Start a job over a file that is already in the vault.
	 *
	 * The job carries its own `vault_file_id`, which is what a retry uses:
	 * a failed or stale job keeps its upload, so trying again should not
	 * ask the user for the file a second time.
	 */
	async function startStatement(fileId?: string) {
		const vaultFileId = fileId ?? statementFiles.at(-1)?.id ?? '';
		if (vaultFileId === '' || statementWallet === '') return;

		starting = true;
		statementError = null;

		try {
			const response = await fetch('/transactions/import/statement', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ vault_file_id: vaultFileId, wallet_id: statementWallet })
			});

			if (!response.ok) {
				statementError = await failureCode(response);
				return;
			}

			const started = (await response.json()) as { job_id?: unknown };
			const jobId = typeof started.job_id === 'string' ? started.job_id : '';
			if (jobId === '') {
				statementError = 'STREAM_FAILED';
				return;
			}

			// Nothing is known about the job until the first poll, so the
			// modal shows the pending state rather than an empty review.
			job = {
				id: jobId,
				status: 'pending',
				vault_file_id: vaultFileId,
				imported: 0,
				skipped: 0,
				duplicates: 0,
				review: null,
				error: null,
				stale: false,
				created_at: '',
				updated_at: ''
			};
			watch(jobId);
		} catch {
			statementError = 'STREAM_FAILED';
		} finally {
			starting = false;
		}
	}

	/** Every two seconds until the job settles, then once more and stop. */
	function watch(jobId: string) {
		watching = jobId;

		const tick = async () => {
			if (watching !== jobId) return;

			const fresh = await pollJob(jobId);
			if (watching !== jobId) return;

			if (fresh) job = fresh;

			if (fresh && isSettled(fresh)) {
				watching = '';
				// Rows landed in the ledger, so whatever this page holds of
				// it is stale.
				if (fresh.status === 'succeeded') await invalidateAll();
				return;
			}

			setTimeout(tick, IMPORT_POLL_INTERVAL);
		};

		setTimeout(tick, IMPORT_POLL_INTERVAL);
	}

	async function pollJob(jobId: string): Promise<ImportJob | null> {
		try {
			const response = await fetch(`/transactions/import/statement/${jobId}`);
			if (!response.ok) return null;
			return parseImportJob(await response.json());
		} catch {
			// A dropped poll is not a failed job. The next one asks again.
			return null;
		}
	}

	/**
	 * Try the same file again.
	 *
	 * A failed or stale job keeps its upload, so this starts a new job over
	 * the file that is already in the vault rather than asking for it twice.
	 */
	function retryStatement() {
		const fileId = job?.vault_file_id ?? undefined;
		watching = '';
		job = null;
		void startStatement(fileId);
	}

	function closeStatement() {
		const finished = phase === 'succeeded';

		watching = '';
		statementOpen = false;
		job = null;
		statementFiles = [];
		statementError = null;

		if (finished) void goto('/transactions');
	}

	/** The code SvelteKit's `error()` carried, or a generic one. */
	async function failureCode(response: Response): Promise<string> {
		try {
			const body = (await response.json()) as { message?: unknown };
			return typeof body.message === 'string' ? body.message : 'STREAM_FAILED';
		} catch {
			return 'STREAM_FAILED';
		}
	}
</script>

<svelte:head><title>{t('import.title')} · {t('app.name')}</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6">
	<div>
		<h1 class="text-h2">{t('import.title')}</h1>
		<p class="text-subtle text-small mt-1">{t('import.subtitle')}</p>
	</div>

	<!-- The four steps, with the one in progress marked. -->
	<ol class="flex flex-wrap items-center gap-2 text-xs">
		{#each STEPS as name, index (name)}
			<li class="flex items-center gap-2">
				<Badge variant={step === name ? 'default' : 'outline'}>
					{index + 1}. {t(`import.step_${name}` as 'import.step_file')}
				</Badge>
				{#if index < STEPS.length - 1}
					<ArrowRight class="text-subtle size-3" />
				{/if}
			</li>
		{/each}
	</ol>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	{#if step === 'file'}
		<section class="space-y-4 border p-6">
			<div class="grid gap-2">
				<Label for="import-wallet" class="text-subtle text-xs font-normal">
					{t('import.wallet')}
				</Label>
				<!-- Workspace data, so the app's picker, never a native
				     `<select>` (D79). -->
				<SelectAccount
					id="import-wallet"
					accounts={walletItems}
					value={walletId}
					placeholder={t('import.wallet')}
					onChange={(value) => (chosenWallet = value)}
				/>
				<p class="text-subtle text-xs">{t('import.wallet_hint')}</p>
			</div>

			<div class="grid gap-2">
				<Label for="import-file" class="text-subtle text-xs font-normal">
					{t('import.file')}
				</Label>
				<Input id="import-file" type="file" accept=".csv,.tsv,.txt,text/csv" onchange={readFile} />
				<p class="text-subtle text-xs">{t('import.file_hint')}</p>
			</div>
		</section>

		<!--
			The other path, picked by what the file is. Deterministic beats
			model-driven wherever structure exists, so this is the one the
			page offers second: a photograph has no columns to map, and the
			model reads its rows because nothing else can (AI-4, D28).
		-->
		<section class="space-y-3 border p-6">
			<h2 class="text-small font-medium">{t('import.statement_title')}</h2>
			<p class="text-subtle text-small">{t('import.statement_hint')}</p>
			<Button variant="outline" onclick={() => (statementOpen = true)}>
				<FileUp />
				{t('import.statement_open')}
			</Button>
		</section>
	{:else if step === 'columns'}
		<section class="space-y-4 border p-6">
			<div class="flex items-center gap-2">
				<FileUp class="text-subtle size-4" />
				<p class="text-small">
					{t('import.read_summary', { name: fileName, rows: file.rows.length })}
				</p>
			</div>

			{#if mappingPending}
				<p class="text-subtle text-small">{t('import.mapping_pending')}</p>
			{:else if mappingFailed}
				<!-- The assistant is one of two paths, never the only one. -->
				<p class="text-subtle text-small">{t('import.mapping_failed')}</p>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				{#each MAPPING_FIELDS as field (field)}
					<div class="grid gap-2">
						<Label for="map-{field}" class="text-subtle text-xs font-normal">
							{fieldLabel(field)}{REQUIRED.includes(field) ? ' *' : ''}
						</Label>
						<SelectColumn
							id="map-{field}"
							columns={file.columns}
							value={mapping[field] ?? NO_COLUMN}
							noneLabel={t('common.none')}
							placeholder={t('common.none')}
							searchPlaceholder={t('import.search_columns')}
							onChange={(value) =>
								(mapping = {
									...mapping,
									[field]: value === NO_COLUMN ? undefined : value
								})}
						/>
					</div>
				{/each}
			</div>

			<p class="text-subtle text-xs">{t('import.amount_hint')}</p>
		</section>
	{:else if step === 'values'}
		<section class="space-y-4 border p-6">
			{#if fileCategories.length === 0}
				<p class="text-subtle text-small">{t('import.no_values')}</p>
			{:else}
				<p class="text-small">{t('import.values_hint')}</p>
				<div class="space-y-3">
					{#each fileCategories as name (name)}
						<div class="flex flex-wrap items-center gap-3">
							<span class="text-body w-48 truncate font-mono text-xs">{name}</span>
							<SelectCategory
								class="max-w-xs"
								categories={categoryItems}
								value={categoryMatches[name] ?? UNCATEGORISED}
								placeholder={t('import.leave_uncategorised')}
								onChange={(value) =>
									(categoryMatches = {
										...categoryMatches,
										[name]: value === UNCATEGORISED ? '' : value
									})}
							/>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		<section class="space-y-4 border p-6">
			{#if result}
				<!-- Created, duplicate and skipped are counted apart, because
				     the fix for each is different (TXN-16, TXN-23). -->
				<dl class="grid grid-cols-3 gap-4 text-center">
					<div>
						<dt class="text-subtle text-xs tracking-widest uppercase">{t('import.created')}</dt>
						<dd class="font-serif text-3xl">{result.created}</dd>
					</div>
					<div>
						<dt class="text-subtle text-xs tracking-widest uppercase">
							{t('import.duplicates')}
						</dt>
						<dd class="font-serif text-3xl">{result.duplicates}</dd>
					</div>
					<div>
						<dt class="text-subtle text-xs tracking-widest uppercase">{t('import.skipped')}</dt>
						<dd class="font-serif text-3xl">{result.skipped.length}</dd>
					</div>
				</dl>

				{#if result.skipped.length > 0}
					<div class="space-y-1">
						<p class="text-subtle text-xs tracking-widest uppercase">{t('import.skipped')}</p>
						<ul class="max-h-64 space-y-1 overflow-y-auto text-xs">
							{#each result.skipped as row (row.index)}
								<li>
									<span class="font-mono">{t('import.line', { line: row.index + 2 })}</span>
									<span class="ml-2">{row.reason}</span>
									{#if row.code === 'FX_RATE_UNAVAILABLE'}
										<span class="text-subtle ml-1">{t('import.needs_rate')}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<Button href="/transactions">{t('import.done')}</Button>
			{:else}
				<p class="text-small">
					{t('import.review_hint', { rows: file.rows.length, name: fileName })}
				</p>

				{#if file.dropped > 0}
					<p class="text-subtle text-small">{t('import.dropped', { count: file.dropped })}</p>
				{/if}

				<!-- The first two rows, as the API will see them. -->
				<div class="overflow-x-auto border">
					<table class="w-full text-xs">
						<thead class="bg-muted/5">
							<tr>
								{#each file.columns as column (column)}
									<th class="border-b px-3 py-2 text-left font-medium">{column}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each file.rows.slice(0, 3) as row, index (index)}
								<tr>
									{#each file.columns as column (column)}
										<td class="border-b px-3 py-2 font-mono">{row[column]}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!--
					The step rides along in the action URL. A bare `?/commit`
					replaces the whole query string, and the wizard would answer
					the commit on step one with the counts nowhere to be seen.
				-->
				<form method="POST" action="?/commit&step=review" use:enhance>
					<input type="hidden" name="wallet_id" value={walletId} />
					<input type="hidden" name="mapping" value={payload.mapping} />
					<input type="hidden" name="rows" value={payload.rows} />
					<input type="hidden" name="categories" value={payload.categories} />
					<Button type="submit" disabled={!mappable || file.rows.length === 0}>
						{t('import.commit', { rows: file.rows.length })}
					</Button>
				</form>
			{/if}
		</section>
	{/if}

	{#if !result}
		<div class="flex items-center justify-between">
			<Button
				variant="outline"
				disabled={step === 'file'}
				onclick={() => writeParams({ step: STEPS[STEPS.indexOf(step) - 1] })}
			>
				<ArrowLeft />
				{t('import.back')}
			</Button>

			<Button
				variant="outline"
				disabled={step === 'review' ||
					(step === 'file' && file.rows.length === 0) ||
					(step === 'columns' && !mappable)}
				onclick={() => writeParams({ step: STEPS[STEPS.indexOf(step) + 1] })}
			>
				{t('import.next')}
				<ArrowRight />
			</Button>
		</div>
	{/if}
</div>

<!--
	The statement path's whole UI. It holds no fetch: the page starts the
	job, polls it and hands down what it says (AI-4).
-->
<ImportAiModal
	bind:open={statementOpen}
	onOpenChange={(open) => {
		if (!open) closeStatement();
	}}
	wallets={data.wallets}
	bind:walletId={statementWallet}
	bind:files={statementFiles}
	{job}
	{phase}
	{starting}
	errorCode={statementError}
	onStart={startStatement}
	onRetry={retryStatement}
	onClose={closeStatement}
/>
