<script lang="ts">
	/**
	 * An attached file, fetched as chunks and shown from a Blob URL
	 * (VLT-3, D23).
	 *
	 * The bytes come back chunk by chunk from this app's own server, which
	 * reads them from the API inside the OWE1 envelope. No signed
	 * object-storage URL is involved at any point, and the object URL is
	 * revoked when the component goes away so the bytes do not sit in the
	 * browser longer than the view that shows them.
	 */
	import Download from '@lucide/svelte/icons/download';
	import FileText from '@lucide/svelte/icons/file-text';
	import Paperclip from '@lucide/svelte/icons/paperclip';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';

	let {
		file
	}: {
		file: { id: string; file_id: string; name: string; type: string; size: number };
	} = $props();

	let objectUrl = $state<string | null>(null);
	let failed = $state(false);

	const CHUNK_BYTES = 512 * 1024;
	const chunkCount = $derived(Math.max(1, Math.ceil(file.size / CHUNK_BYTES)));
	const isImage = $derived(file.type.startsWith('image/'));

	$effect(() => {
		let url: string | null = null;
		let cancelled = false;

		(async () => {
			try {
				const parts: ArrayBuffer[] = [];
				for (let index = 0; index < chunkCount; index += 1) {
					const response = await fetch(`/transactions/files/${file.file_id}/chunks/${index}`);
					if (!response.ok) throw new Error(String(response.status));
					parts.push(await response.arrayBuffer());
				}
				if (cancelled) return;

				// The type comes from the record, which the API sniffed from
				// the bytes. It is never taken from the filename.
				url = URL.createObjectURL(new Blob(parts, { type: file.type }));
				objectUrl = url;
			} catch {
				if (!cancelled) failed = true;
			}
		})();

		return () => {
			cancelled = true;
			// Revoked on teardown: an object URL the page forgets is bytes
			// the browser holds until the tab closes.
			if (url) URL.revokeObjectURL(url);
			objectUrl = null;
		};
	});
</script>

<div class="border-muted/20 bg-muted/5 space-y-2 border p-3">
	<div class="flex items-center gap-2 text-sm">
		<Paperclip class="text-subtle size-3.5 shrink-0" aria-hidden="true" />
		<span class="min-w-0 flex-1 truncate">{file.name}</span>
		{#if objectUrl}
			<Button
				href={objectUrl}
				download={file.name}
				variant="ghost"
				size="icon"
				class="size-6"
				aria-label="Download {file.name}"
			>
				<Download class="size-3.5" />
			</Button>
		{/if}
	</div>

	{#if failed}
		<p class="text-subtle text-xs">Those bytes could not be read.</p>
	{:else if !objectUrl}
		<div class="flex items-center gap-2">
			<Spinner size={12} />
			<span class="text-subtle text-xs">Fetching {chunkCount} chunk(s).</span>
		</div>
	{:else if isImage}
		<img src={objectUrl} alt={file.name} class="max-h-64 w-full object-contain" />
	{:else}
		<div class="text-subtle flex items-center gap-2 text-xs">
			<FileText class="size-3.5" aria-hidden="true" />
			<span>{file.type}</span>
		</div>
	{/if}
</div>
