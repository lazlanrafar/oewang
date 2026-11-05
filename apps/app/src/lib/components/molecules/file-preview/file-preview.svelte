<script lang="ts">
	/**
	 * A file shown back in full, the body of the old app's `FilePreviewSheet`.
	 *
	 * An image as itself, a PDF in a frame, anything else as "no preview".
	 * The bytes come through `load`, chunk by chunk inside the envelope, and
	 * are shown from a Blob URL (VLT-3, D23); this component owns that URL's
	 * life and revokes it when it goes away. The URL is also handed up, so the
	 * sheet's open and download buttons use the same bytes rather than
	 * fetching them twice.
	 */
	import FileIcon from '@lucide/svelte/icons/file';
	import FileText from '@lucide/svelte/icons/file-text';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';

	type PreviewFile = { id: string; name: string; type: string; size: number };

	let {
		file,
		load,
		objectUrl = $bindable(null),
		variant = 'full',
		loadingLabel,
		failedLabel,
		unavailableLabel,
		openOriginalLabel
	}: {
		file: PreviewFile;
		/** Fetch the bytes. Progress is reported as it goes. */
		load: (
			file: { file_id: string; type: string; size: number },
			onProgress: (done: number, total: number) => void
		) => Promise<Blob>;
		objectUrl?: string | null;
		/**
		 * `full` fills a sheet, as the old preview sheet did; `box` is the old
		 * vault panel's 16:9 box, with the details below it.
		 */
		variant?: 'full' | 'box';
		loadingLabel: (done: number, total: number) => string;
		failedLabel: string;
		unavailableLabel: string;
		openOriginalLabel: string;
	} = $props();

	let failed = $state(false);
	let done = $state(0);
	let total = $state(1);

	const isImage = $derived(file.type.startsWith('image/'));
	const isPdf = $derived(file.type === 'application/pdf');

	$effect(() => {
		const target = { file_id: file.id, type: file.type, size: file.size };
		let url: string | null = null;
		let cancelled = false;
		failed = false;

		(async () => {
			try {
				const bytes = await load(target, (fetched, count) => {
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
			// Revoked on teardown: an object URL the page forgets is bytes the
			// browser holds until the tab closes.
			if (url) URL.revokeObjectURL(url);
			objectUrl = null;
		};
	});
</script>

{#if variant === 'box'}
	<div
		class="flex aspect-video items-center justify-center overflow-hidden border bg-muted/30 shadow-inner"
	>
		{#if failed}
			<p class="text-muted-foreground text-xs">{failedLabel}</p>
		{:else if !objectUrl}
			<div class="flex items-center gap-2 text-muted-foreground">
				<Spinner size={14} />
				<span class="text-xs">{loadingLabel(done, total)}</span>
			</div>
		{:else if isImage}
			<div class="relative h-full w-full">
				<img src={objectUrl} alt={file.name} class="absolute inset-0 h-full w-full object-contain" />
			</div>
		{:else if isPdf}
			<iframe src={`${objectUrl}#toolbar=0`} title={file.name} class="h-full w-full bg-background"></iframe>
		{:else}
			<FileText class="h-16 w-16 text-muted-foreground" aria-hidden="true" />
		{/if}
	</div>
{:else}
<div class="flex min-h-[calc(100vh-100px)] items-center justify-center">
	{#if failed}
		<p class="text-muted-foreground text-sm">{failedLabel}</p>
	{:else if !objectUrl}
		<div class="flex items-center gap-2 text-muted-foreground">
			<Spinner size={14} />
			<span class="text-xs">{loadingLabel(done, total)}</span>
		</div>
	{:else if isImage}
		<img
			src={objectUrl}
			alt={file.name}
			class="fade-in zoom-in h-auto max-w-full animate-in rounded-lg border shadow-sm duration-300"
		/>
	{:else if isPdf}
		<iframe
			src={`${objectUrl}#toolbar=0`}
			title={file.name}
			class="fade-in h-[calc(100vh-180px)] w-full animate-in rounded-lg border bg-background shadow-sm duration-500"
		></iframe>
	{:else}
		<div
			class="fade-in slide-in-from-bottom-4 flex animate-in flex-col items-center justify-center gap-4 text-muted-foreground duration-500"
		>
			<div class="rounded-full bg-muted/30 p-8">
				<FileIcon class="h-16 w-16" />
			</div>
			<p class="font-medium text-sm">{unavailableLabel}</p>
			<Button variant="outline" size="sm" href={objectUrl} target="_blank" rel="noopener">
				{openOriginalLabel}
			</Button>
		</div>
	{/if}
</div>
{/if}
