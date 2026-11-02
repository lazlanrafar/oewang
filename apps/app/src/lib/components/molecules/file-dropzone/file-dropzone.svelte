<script lang="ts" module>
	export type UploadedFile = { id: string; name: string; type: string; size: number };

	/** What this product accepts. Nothing that runs when it is opened. */
	export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
</script>

<script lang="ts">
	/**
	 * Drop a receipt here (VLT-1, TXN-13).
	 *
	 * The file is split in the browser and sent chunk by chunk to this
	 * app's own server, which forwards each one into the OWE1 envelope. The
	 * browser never talks to the API and is never handed an object-storage
	 * URL (D5, D23).
	 *
	 * Progress is per chunk, which is real progress rather than a bar that
	 * jumps from nothing to everything.
	 */
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '../../atoms/button/index.js';
	import { Progress } from '../../atoms/progress/index.js';
	import { cn } from '$lib/utils.js';

	let {
		files = $bindable([]),
		disabled = false,
		class: className
	}: {
		files?: UploadedFile[];
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

	const busy = $derived(uploading.some((upload) => !upload.error));

	/** Replace one entry, by id, so the change reaches the array. */
	function amend(id: string, change: Partial<InFlight>) {
		uploading = uploading.map((entry) => (entry.id === id ? { ...entry, ...change } : entry));
	}

	async function accept(chosen: FileList | null | undefined) {
		for (const file of Array.from(chosen ?? [])) await send(file);
	}

	async function send(file: File) {
		const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		uploading = [...uploading, { id, name: file.name, sent: 0, total: 1 }];

		try {
			if (!ACCEPTED.includes(file.type)) {
				amend(id, { error: 'Accepted: JPEG, PNG, WebP and PDF.' });
				return;
			}

			const begun = await post('/transactions/files', {
				filename: file.name,
				content_type: file.type,
				size_bytes: file.size
			});

			amend(id, { total: begun.chunk_count || 1 });

			for (let index = 0; index < begun.chunk_count; index += 1) {
				const start = index * begun.chunk_size;
				const slice = file.slice(start, start + begun.chunk_size);

				const response = await fetch(`/transactions/files/${begun.id}/chunks/${index}`, {
					method: 'PUT',
					body: await slice.arrayBuffer()
				});
				if (!response.ok) throw new Error(await response.text());

				amend(id, { sent: index + 1 });
			}

			const completed = await post(`/transactions/files/${begun.id}/complete`, {});
			files = [
				...files,
				{ id: completed.id, name: completed.name, type: completed.type, size: completed.size }
			];
			uploading = uploading.filter((entry) => entry.id !== id);
		} catch (error) {
			// The API refuses a file whose bytes are not what it said they
			// were, and leaves nothing behind when it does.
			amend(id, { error: message(error) });
		}
	}

	/** The API's code, if the failure carried one. */
	function message(error: unknown): string {
		const raw = error instanceof Error ? error.message : '';
		if (raw.includes('UNSUPPORTED_FILE_TYPE')) return 'Those bytes are not the type claimed.';
		if (raw.includes('FILE_TOO_LARGE')) return 'The limit is 10 MB.';
		return 'Upload failed.';
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function post(url: string, body: unknown): Promise<any> {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(await response.text());
		return response.json();
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
			accept(event.dataTransfer?.files);
		}}
	>
		<Upload class="text-subtle size-4" aria-hidden="true" />
		<p class="text-subtle text-xs">Drop a receipt, or</p>
		<Button
			type="button"
			variant="outline"
			size="sm"
			{disabled}
			onclick={() => input?.click()}
		>
			Choose a file
		</Button>
		<input
			bind:this={input}
			type="file"
			class="hidden"
			accept={ACCEPTED.join(',')}
			multiple
			onchange={(event) => {
				accept((event.currentTarget as HTMLInputElement).files);
				// Clear it, so choosing the same file twice still fires.
				(event.currentTarget as HTMLInputElement).value = '';
			}}
		/>
		<p class="text-subtle text-xs">JPEG, PNG, WebP or PDF, up to 10 MB.</p>
	</div>

	{#each uploading as upload (upload.id)}
		<div class="space-y-1">
			<div class="flex items-center justify-between gap-2 text-xs">
				<span class="truncate">{upload.name}</span>
				{#if upload.error}
					<span class="text-destructive shrink-0">{upload.error}</span>
				{:else}
					<span class="text-subtle shrink-0 tabular-nums">
						{Math.round((upload.sent / upload.total) * 100)}%
					</span>
				{/if}
			</div>
			{#if !upload.error}
				<Progress value={(upload.sent / upload.total) * 100} class="h-1" />
			{/if}
		</div>
	{/each}

	{#each files as file (file.id)}
		<div class="border-muted/20 bg-muted/5 flex items-center gap-2 border px-3 py-2 text-sm">
			<Paperclip class="text-subtle size-3.5 shrink-0" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate">{file.name}</span>
			<!-- Removing an attachment detaches it. The file itself stays,
			     because the same receipt may be on another transaction (VLT-5). -->
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="size-6"
				aria-label="Remove {file.name}"
				{disabled}
				onclick={() => (files = files.filter((candidate) => candidate.id !== file.id))}
			>
				<X class="size-3.5" />
			</Button>
		</div>
	{/each}

	<!-- Every attached file's id, so the form submits the whole set. -->
	{#each files as file (file.id)}
		<input type="hidden" name="attachment_ids" value={file.id} />
	{/each}

	{#if busy}
		<p class="text-subtle text-xs">Uploading. The form will wait.</p>
	{/if}
</div>
