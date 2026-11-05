<script lang="ts" module>
	export type PickerFile = {
		id: string;
		name: string;
		type: string;
		size: number;
		thumbnail?: boolean | null;
	};

	export type PickerSort = 'newest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';
	export type PickerType = '' | 'image' | 'pdf';
	export type PickerSize = '' | 'lt1' | '1to5' | 'gt5';
</script>

<script lang="ts">
	/**
	 * Choose files from the vault, the old app's `VaultPickerModal`.
	 *
	 * Same dialog, same rows of controls, same grid and list. Two things
	 * differ, both fixes: search, sort and both filters go to the server and
	 * cover every page, where the old one narrowed only the page it had; and a
	 * picked file comes back whole, so the caller shows its real name rather
	 * than its id.
	 *
	 * The search box and the filters are this dialog's own input, like a
	 * combobox's typed text, so they are not written to the page's URL.
	 */
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Grid from '@lucide/svelte/icons/grid-2x2';
	import ListIcon from '@lucide/svelte/icons/list';
	import Search from '@lucide/svelte/icons/search';
	import { toast } from 'svelte-sonner';

	import { Button } from '../../atoms/button/index.js';
	import * as Dialog from '../../atoms/dialog/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { FileIcon } from '../file-icon/index.js';
	import { cn } from '$lib/utils.js';

	type Labels = {
		title: string;
		search: string;
		sort: string;
		sorts: Record<PickerSort, string>;
		listView: string;
		gridView: string;
		fileType: string;
		types: Record<PickerType, string>;
		fileSize: string;
		sizes: Record<PickerSize, string>;
		sizesShort: Record<Exclude<PickerSize, ''>, string>;
		addMedia: string;
		drop: string;
		loading: string;
		empty: string;
		emptyFiltered: string;
		clearSelection: string;
		page: (page: number, total: number) => string;
		previous: string;
		next: string;
		cancel: string;
		done: string;
		select: (name: string) => string;
		uploading: (count: number) => string;
		uploaded: string;
		uploadFailed: string;
	};

	let {
		open = $bindable(false),
		selected = [],
		onconfirm,
		list,
		upload,
		thumbnail,
		formatOf,
		formatBytes,
		accept,
		pageSize,
		labels
	}: {
		open?: boolean;
		/** What is already attached, ticked when the dialog opens. */
		selected?: PickerFile[];
		onconfirm: (files: PickerFile[]) => void;
		list: (query: {
			search?: string;
			type?: PickerType;
			size?: PickerSize;
			sort?: PickerSort;
			page?: number;
			limit?: number;
		}) => Promise<{ files: PickerFile[]; total_pages: number }>;
		upload: (file: File, onProgress: (sent: number, total: number) => void) => Promise<PickerFile>;
		thumbnail: (file: PickerFile) => string | null;
		formatOf: (type: string) => string;
		formatBytes: (bytes: number) => string;
		accept: string[];
		pageSize: number;
		labels: Labels;
	} = $props();

	const SORTS: PickerSort[] = ['newest', 'name_asc', 'name_desc', 'size_desc', 'size_asc'];
	const TYPES: PickerType[] = ['', 'image', 'pdf'];
	const SIZES: PickerSize[] = ['', 'lt1', '1to5', 'gt5'];

	let search = $state('');
	let debounced = $state('');
	let sortBy = $state<PickerSort>('newest');
	let filterType = $state<PickerType>('');
	let filterSize = $state<PickerSize>('');
	let view = $state<'grid' | 'list'>('grid');
	let page = $state(1);
	let totalPages = $state(1);
	let files = $state<PickerFile[]>([]);
	let loading = $state(false);
	let uploading = $state(false);
	/** Picked files by id, whole, so a pick on another page survives paging. */
	let pending = $state<Map<string, PickerFile>>(new Map());
	let input = $state<HTMLInputElement | null>(null);

	const filtered = $derived(debounced !== '' || filterType !== '' || filterSize !== '');

	// Reset to what is attached each time the dialog opens.
	$effect(() => {
		if (!open) return;
		pending = new Map(selected.map((file) => [file.id, file]));
	});

	// The search is sent once typing pauses, not on every keystroke.
	$effect(() => {
		const value = search.trim();
		const timer = setTimeout(() => {
			debounced = value;
			page = 1;
		}, 300);
		return () => clearTimeout(timer);
	});

	let request = 0;
	$effect(() => {
		if (!open) return;
		const query = {
			search: debounced,
			type: filterType,
			size: filterSize,
			sort: sortBy,
			page,
			limit: pageSize
		};
		const mine = ++request;
		loading = true;
		list(query)
			.then((answer) => {
				// A slower answer to an older query must not overwrite a newer one.
				if (mine !== request) return;
				files = answer.files;
				totalPages = answer.total_pages;
			})
			.catch(() => {
				if (mine === request) files = [];
			})
			.finally(() => {
				if (mine === request) loading = false;
			});
	});

	function toggle(file: PickerFile) {
		const next = new Map(pending);
		if (next.has(file.id)) next.delete(file.id);
		else next.set(file.id, file);
		pending = next;
	}

	async function uploadFiles(list: FileList | null | undefined) {
		const chosen = Array.from(list ?? []).filter((file) => accept.includes(file.type));
		if (chosen.length === 0) return;

		uploading = true;
		const toastId = toast.loading(labels.uploading(chosen.length));
		const results = await Promise.allSettled(chosen.map((file) => upload(file, () => {})));
		uploading = false;

		const stored = results
			.filter((result): result is PromiseFulfilledResult<PickerFile> => result.status === 'fulfilled')
			.map((result) => result.value);

		if (stored.length === chosen.length) toast.success(labels.uploaded, { id: toastId });
		else toast.error(labels.uploadFailed, { id: toastId });

		// Shown first and picked, as the old picker did.
		files = [...stored, ...files.filter((file) => !stored.some((added) => added.id === file.id))];
		const next = new Map(pending);
		for (const file of stored) next.set(file.id, file);
		pending = next;
	}

	function confirm() {
		onconfirm([...pending.values()]);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[85vh] flex-col sm:max-w-[900px]">
		<Dialog.Header class="sr-only">
			<Dialog.Title>{labels.title}</Dialog.Title>
		</Dialog.Header>

		<div class="flex shrink-0 flex-col gap-4 pt-6">
			<div class="flex items-center justify-between gap-4">
				<div class="relative flex-1">
					<Search class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
					<Input
						placeholder={labels.search}
						aria-label={labels.search}
						class="h-8 w-full bg-transparent pl-9"
						bind:value={search}
					/>
				</div>

				<div class="flex items-center gap-2">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="outline" class="hidden h-8 sm:flex" {...props}>
									<ArrowUpDown class="mr-2 h-4 w-4" />
									{labels.sort}
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#each SORTS as option (option)}
								<DropdownMenu.Item
									onSelect={() => {
										sortBy = option;
										page = 1;
									}}
								>
									{labels.sorts[option]}
									{#if sortBy === option}<Check class="ml-auto h-4 w-4" />{/if}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="outline" class="h-8 px-3" {...props}>
									{#if view === 'list'}
										<ListIcon class="mr-2 h-4 w-4 text-muted-foreground" />
										{labels.listView}
									{:else}
										<Grid class="mr-2 h-4 w-4 text-muted-foreground" />
										{labels.gridView}
									{/if}
									<ChevronDown class="ml-2 h-4 w-4 text-muted-foreground" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-40">
							<DropdownMenu.Item onSelect={() => (view = 'list')} class="justify-between">
								<span class="flex items-center">
									<ListIcon class="mr-2 h-4 w-4 text-muted-foreground" />
									{labels.listView}
								</span>
								{#if view === 'list'}<Check class="h-4 w-4" />{/if}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => (view = 'grid')} class="justify-between">
								<span class="flex items-center">
									<Grid class="mr-2 h-4 w-4 text-muted-foreground" />
									{labels.gridView}
								</span>
								{#if view === 'grid'}<Check class="h-4 w-4" />{/if}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</div>

			<div class="flex items-center gap-2 overflow-x-auto pb-1">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" {...props}>
								{filterType === '' ? labels.fileType : labels.types[filterType]}
								<ChevronDown class="ml-1 h-3 w-3" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content>
						{#each TYPES as option (option)}
							<DropdownMenu.Item
								onSelect={() => {
									filterType = option;
									page = 1;
								}}
							>
								{labels.types[option]}
								{#if filterType === option}<Check class="ml-auto h-4 w-4" />{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="sm" {...props}>
								{filterSize === '' ? labels.fileSize : labels.sizesShort[filterSize]}
								<ChevronDown class="ml-1 h-3 w-3" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content>
						{#each SIZES as option (option)}
							<DropdownMenu.Item
								onSelect={() => {
									filterSize = option;
									page = 1;
								}}
							>
								{labels.sizes[option]}
								{#if filterSize === option}<Check class="ml-auto h-4 w-4" />{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex flex-col items-center justify-center gap-2 border border-dashed p-8 py-10 text-center transition-colors hover:bg-muted/50"
				ondragover={(event) => event.preventDefault()}
				ondrop={(event) => {
					event.preventDefault();
					uploadFiles(event.dataTransfer?.files);
				}}
			>
				<input
					bind:this={input}
					type="file"
					multiple
					accept={accept.join(',')}
					class="hidden"
					onchange={(event) => {
						uploadFiles((event.currentTarget as HTMLInputElement).files);
						(event.currentTarget as HTMLInputElement).value = '';
					}}
				/>
				<Button variant="outline" onclick={() => input?.click()} disabled={uploading}>
					{labels.addMedia}
					<ChevronDown class="ml-2 h-4 w-4" />
				</Button>
				<p class="text-muted-foreground text-sm">{labels.drop}</p>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if loading && files.length === 0}
				<p class="py-8 text-center text-muted-foreground text-sm">{labels.loading}</p>
			{:else if files.length === 0}
				<p class="py-8 text-center text-muted-foreground text-sm">
					{filtered ? labels.emptyFiltered : labels.empty}
				</p>
			{:else}
				<div class={cn('p-4', loading && 'opacity-60')}>
					{#if view === 'list'}
						<div class="flex flex-col gap-0 border-t">
							{#each files as file (file.id)}
								{@const isPicked = pending.has(file.id)}
								{@const src = thumbnail(file)}
								<div
									class="group flex items-center gap-4 border-b px-2 py-3 transition-colors hover:bg-muted/30"
								>
									<div class="flex shrink-0 items-center">
										<button
											type="button"
											role="checkbox"
											aria-checked={isPicked}
											aria-label={labels.select(file.name)}
											onclick={() => toggle(file)}
											class={cn(
												'flex h-5 w-5 cursor-pointer items-center justify-center border shadow-sm transition-colors',
												isPicked
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-input bg-background hover:border-foreground'
											)}
										>
											{#if isPicked}<Check class="h-3.5 w-3.5" strokeWidth={3} />{/if}
										</button>
									</div>
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border bg-muted"
									>
										{#if src}
											<img {src} alt="" loading="lazy" class="h-full w-full object-cover" />
										{:else}
											<FileIcon type={file.type} />
										{/if}
									</div>
									<div
										class="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center"
									>
										<div class="flex-1 truncate pr-4">
											<button
												type="button"
												class="block max-w-full cursor-pointer truncate text-left font-medium text-sm"
												onclick={() => toggle(file)}
											>
												{file.name}
											</button>
										</div>
										<div
											class="flex w-full shrink-0 items-center justify-between gap-4 text-muted-foreground text-sm sm:w-[200px] sm:justify-start sm:gap-8"
										>
											<span class="w-16 truncate font-semibold text-xs uppercase">
												{formatOf(file.type)}
											</span>
											<span class="w-20 truncate text-right">{formatBytes(file.size)}</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
							{#each files as file (file.id)}
								{@const isPicked = pending.has(file.id)}
								{@const src = thumbnail(file)}
								<div class="group relative flex flex-col gap-2 bg-muted/20 pb-3">
									<button
										type="button"
										class="relative aspect-square w-full cursor-pointer overflow-hidden border bg-muted"
										aria-label={labels.select(file.name)}
										aria-pressed={isPicked}
										onclick={() => toggle(file)}
									>
										{#if src}
											<img
												{src}
												alt=""
												loading="lazy"
												class="h-full w-full object-cover transition-transform group-hover:scale-105"
											/>
										{:else}
											<span class="flex h-full w-full items-center justify-center">
												<FileIcon type={file.type} />
											</span>
										{/if}

										<span class="absolute top-2 left-2 z-10 transition-opacity">
											<span
												class={cn(
													'flex h-5 w-5 items-center justify-center border shadow-sm transition-all',
													isPicked
														? 'border-primary bg-primary text-primary-foreground opacity-100'
														: 'border-input bg-background/80 opacity-0 backdrop-blur-sm group-hover:opacity-100'
												)}
											>
												{#if isPicked}<Check class="h-3 w-3" strokeWidth={3} />{/if}
											</span>
										</span>
									</button>

									<div class="flex flex-col px-3 text-center">
										<span class="truncate font-medium text-sm" title={file.name}>{file.name}</span>
										<span class="mt-0.5 text-muted-foreground text-xs uppercase">
											{formatOf(file.type)}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div
			class="mt-auto flex shrink-0 flex-col items-center justify-between gap-4 border-t py-4 sm:flex-row"
		>
			<div class="flex w-full items-center justify-between sm:w-auto sm:justify-start">
				<Button
					variant="link"
					class="h-auto p-0 font-medium text-primary"
					onclick={() => (pending = new Map())}
				>
					{labels.clearSelection}
				</Button>

				{#if totalPages > 1}
					<div class="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							aria-label={labels.previous}
							disabled={page <= 1}
							onclick={() => (page -= 1)}
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
						<span class="px-2 text-xs">{labels.page(page, totalPages)}</span>
						<Button
							variant="outline"
							size="icon"
							aria-label={labels.next}
							disabled={page >= totalPages}
							onclick={() => (page += 1)}
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				{/if}
			</div>
			<div class="ml-auto flex w-full gap-2 sm:w-auto">
				<Button variant="outline" onclick={() => (open = false)}>{labels.cancel}</Button>
				<Button onclick={confirm}>{labels.done}</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
