<script lang="ts">
	/**
	 * One attached file as a square, the old app's `AttachmentCard`.
	 *
	 * An image shows its preview, anything else its type icon and name; the
	 * name and size slide in on hover, and the remove button sits top-right.
	 * The preview is a small JPEG the API makes once (D91), never the whole
	 * file. Clickable when `onopen` is given, as the detail sheet's tiles are;
	 * the form sheet's are not, as in the old app.
	 */
	import X from '@lucide/svelte/icons/x';

	import { FileIcon } from '../file-icon/index.js';
	import { cn } from '$lib/utils.js';

	type TileFile = { id: string; name: string; type: string; size: number; thumbnail?: boolean | null };

	let {
		file,
		thumbnail,
		formatBytes,
		openLabel,
		removeLabel,
		onopen,
		onremove,
		class: className
	}: {
		file: TileFile;
		thumbnail: (file: TileFile) => string | null;
		formatBytes: (bytes: number) => string;
		openLabel: (name: string) => string;
		removeLabel: (name: string) => string;
		onopen?: (file: TileFile) => void;
		/** Omitted, no remove button: a reader cannot detach a file. */
		onremove?: (file: TileFile) => void;
		class?: string;
	} = $props();

	const src = $derived(thumbnail(file));
	let loaded = $state(false);
	let failed = $state(false);
</script>

<div
	class={cn(
		'group relative aspect-square overflow-hidden border bg-muted/10 transition-colors hover:bg-muted/20',
		onopen ? 'cursor-pointer' : 'cursor-default',
		className
	)}
>
	{#if src && !failed}
		<img
			{src}
			alt={file.name}
			loading="lazy"
			class="absolute inset-0 h-full w-full object-cover"
			onload={() => (loaded = true)}
			onerror={() => (failed = true)}
		/>
		{#if !loaded}
			<div class="absolute inset-0 flex h-full w-full items-center justify-center bg-muted/20">
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
			</div>
		{/if}
	{:else}
		<div class="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
			<FileIcon type={file.type} />
			<span class="line-clamp-2 text-center text-[9px] leading-tight">{file.name}</span>
		</div>
	{/if}

	<div
		class="pointer-events-none absolute inset-0 flex flex-col items-start justify-end bg-linear-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
	>
		<p class="line-clamp-1 w-full font-medium text-[9px] text-white leading-tight">{file.name}</p>
		{#if file.size > 0}<p class="text-[8px] text-white/70">{formatBytes(file.size)}</p>{/if}
	</div>

	{#if onopen}
		<!-- The whole tile opens the file; a real button, so a keyboard can. -->
		<button
			type="button"
			class="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
			aria-label={openLabel(file.name)}
			onclick={() => onopen?.(file)}
		></button>
	{/if}

	{#if onremove}
		<!-- Detaches the file. The file itself stays in the vault, because the
		     same one may be attached elsewhere (VLT-5). -->
		<button
			type="button"
			aria-label={removeLabel(file.name)}
			onclick={(event) => {
				event.stopPropagation();
				onremove?.(file);
			}}
			class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 focus-visible:opacity-100"
		>
			<X class="h-2.5 w-2.5" />
		</button>
	{/if}
</div>
