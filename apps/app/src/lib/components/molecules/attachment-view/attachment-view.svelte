<script lang="ts">
	/**
	 * An attached file, shown from a Blob URL (VLT-3, D23).
	 *
	 * The component does not know where the bytes come from: `load` is handed
	 * to it, so this stays a design-system piece and the routes stay in
	 * `$lib/files.ts`. What it does own is the object URL's life, which is
	 * revoked when the view goes away so the bytes do not sit in the browser
	 * longer than the thing that shows them.
	 */
	import Download from '@lucide/svelte/icons/download';
	import FileText from '@lucide/svelte/icons/file-text';
	import Paperclip from '@lucide/svelte/icons/paperclip';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';

	type AttachedFile = { id: string; file_id: string; name: string; type: string; size: number };

	let {
		file,
		load,
		downloadLabel,
		loadingLabel,
		failedLabel
	}: {
		file: AttachedFile;
		/** Fetch the bytes. Progress is reported as it goes. */
		load: (file: AttachedFile, onProgress: (done: number, total: number) => void) => Promise<Blob>;
		downloadLabel: (name: string) => string;
		loadingLabel: (done: number, total: number) => string;
		failedLabel: string;
	} = $props();

	let objectUrl = $state<string | null>(null);
	let failed = $state(false);
	let done = $state(0);
	let total = $state(1);

	const isImage = $derived(file.type.startsWith('image/'));

	$effect(() => {
		let url: string | null = null;
		let cancelled = false;

		(async () => {
			try {
				const bytes = await load(file, (fetched, count) => {
					if (cancelled) return;
					done = fetched;
					total = count;
				});
				if (cancelled) return;

				url = URL.createObjectURL(bytes);
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
				aria-label={downloadLabel(file.name)}
			>
				<Download class="size-3.5" />
			</Button>
		{/if}
	</div>

	{#if failed}
		<p class="text-subtle text-xs">{failedLabel}</p>
	{:else if !objectUrl}
		<div class="flex items-center gap-2">
			<Spinner size={12} />
			<span class="text-subtle text-xs">{loadingLabel(done, total)}</span>
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
