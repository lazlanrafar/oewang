<script lang="ts" module>
	export type UploadedFile = { id: string; name: string; type: string; size: number };
</script>

<script lang="ts">
	/**
	 * Drop a file here.
	 *
	 * The component owns the drop target, the per-file progress and the list
	 * of what is attached. It does not own the transport: `upload` is handed
	 * to it, so the routes, the limits and the accepted types stay in
	 * `$lib/files.ts` and this stays a design-system piece that any feature
	 * can use. Progress is per chunk, which is real progress rather than a
	 * bar that jumps from nothing to everything.
	 */
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '../../atoms/button/index.js';
	import { Progress } from '../../atoms/progress/index.js';
	import { cn } from '$lib/utils.js';

	let {
		files = $bindable([]),
		upload,
		accept = [],
		name,
		prompt,
		chooseLabel,
		hint,
		busyLabel,
		rejectedMessage,
		removeLabel,
		errorMessage,
		disabled = false,
		class: className
	}: {
		files?: UploadedFile[];
		/** Send one file, reporting progress, and return what was stored. */
		upload: (
			file: File,
			onProgress: (sent: number, total: number) => void
		) => Promise<UploadedFile>;
		/** Accepted content types. Empty means anything. */
		accept?: string[];
		/** The form field each attached id posts under. Omitted, nothing posts. */
		name?: string;
		prompt: string;
		chooseLabel: string;
		hint?: string;
		busyLabel?: string;
		/** Shown when a chosen file is not one of `accept`. */
		rejectedMessage?: string;
		removeLabel: (name: string) => string;
		/** What a failed upload says, which is the caller's to map (UI-1). */
		errorMessage: (error: unknown) => string;
		disabled?: boolean;
		class?: string;
	} = $props();

	/*
	 * One entry per upload in flight, each with its own id.
	 *
	 * Identified rather than compared by reference: `$state` wraps what is
	 * put into the array in a proxy, so the object a caller still holds and
	 * the one in the array are no longer `===`. Mutating the held one also
	 * updates nothing, which is what kept the progress bar at zero.
	 */
	type InFlight = { id: string; name: string; sent: number; total: number; error?: string };

	let uploading = $state<InFlight[]>([]);
	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	const busy = $derived(uploading.some((entry) => !entry.error));

	/** Replace one entry, by id, so the change reaches the array. */
	function amend(id: string, change: Partial<InFlight>) {
		uploading = uploading.map((entry) => (entry.id === id ? { ...entry, ...change } : entry));
	}

	async function chosen(list: FileList | null | undefined) {
		for (const file of Array.from(list ?? [])) await send(file);
	}

	async function send(file: File) {
		const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		uploading = [...uploading, { id, name: file.name, sent: 0, total: 1 }];

		if (accept.length > 0 && !accept.includes(file.type)) {
			amend(id, { error: rejectedMessage ?? errorMessage(new Error('UNSUPPORTED_FILE_TYPE')) });
			return;
		}

		try {
			const stored = await upload(file, (sent, total) => amend(id, { sent, total }));
			files = [...files, stored];
			uploading = uploading.filter((entry) => entry.id !== id);
		} catch (error) {
			// The API refuses a file whose bytes are not what it said they
			// were, and leaves nothing behind when it does.
			amend(id, { error: errorMessage(error) });
		}
	}
</script>

<div class={cn('space-y-3', className)}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class={cn(
			'border-input flex flex-col items-center justify-center gap-2 border border-dashed px-4 py-6 text-center transition-colors',
			dragging && 'border-primary bg-muted/20',
			disabled && 'pointer-events-none opacity-50'
		)}
		ondragover={(event) => {
			event.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(event) => {
			event.preventDefault();
			dragging = false;
			chosen(event.dataTransfer?.files);
		}}
	>
		<Upload class="text-subtle size-4" aria-hidden="true" />
		<p class="text-subtle text-xs">{prompt}</p>
		<Button type="button" variant="outline" size="sm" {disabled} onclick={() => input?.click()}>
			{chooseLabel}
		</Button>
		<input
			bind:this={input}
			type="file"
			class="hidden"
			accept={accept.join(',') || undefined}
			multiple
			onchange={(event) => {
				chosen((event.currentTarget as HTMLInputElement).files);
				// Clear it, so choosing the same file twice still fires.
				(event.currentTarget as HTMLInputElement).value = '';
			}}
		/>
		{#if hint}<p class="text-subtle text-xs">{hint}</p>{/if}
	</div>

	{#each uploading as entry (entry.id)}
		<div class="space-y-1">
			<div class="flex items-center justify-between gap-2 text-xs">
				<span class="truncate">{entry.name}</span>
				{#if entry.error}
					<span class="text-destructive shrink-0">{entry.error}</span>
				{:else}
					<span class="text-subtle shrink-0 tabular-nums">
						{Math.round((entry.sent / entry.total) * 100)}%
					</span>
				{/if}
			</div>
			{#if !entry.error}
				<Progress value={(entry.sent / entry.total) * 100} class="h-1" />
			{/if}
		</div>
	{/each}

	{#each files as file (file.id)}
		<div class="border-muted/20 bg-muted/5 flex items-center gap-2 border px-3 py-2 text-sm">
			<Paperclip class="text-subtle size-3.5 shrink-0" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate">{file.name}</span>
			<!-- Removing an attachment detaches it. The file itself stays,
			     because the same one may be attached elsewhere (VLT-5). -->
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="size-6"
				aria-label={removeLabel(file.name)}
				{disabled}
				onclick={() => (files = files.filter((candidate) => candidate.id !== file.id))}
			>
				<X class="size-3.5" />
			</Button>
		</div>
	{/each}

	{#if name}
		<!-- Every attached file's id, so the form submits the whole set. -->
		{#each files as file (file.id)}
			<input type="hidden" {name} value={file.id} />
		{/each}
	{/if}

	{#if busy && busyLabel}
		<p class="text-subtle text-xs">{busyLabel}</p>
	{/if}
</div>
