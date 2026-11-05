<script lang="ts">
	/**
	 * A file in the vault grid, the old app's `VaultItemCard`: a square with
	 * the preview filling it and the name on a gradient along the bottom.
	 */
	import FileText from '@lucide/svelte/icons/file-text';

	import { cn } from '$lib/utils.js';

	type CardFile = { id: string; name: string; type: string; thumbnail?: boolean | null };

	let {
		file,
		thumbnail,
		selected = false,
		onselect,
		label
	}: {
		file: CardFile;
		thumbnail: (file: CardFile) => string | null;
		selected?: boolean;
		onselect: (file: CardFile) => void;
		label: string;
	} = $props();

	const src = $derived(thumbnail(file));
	let failed = $state(false);
</script>

<button
	type="button"
	aria-label={label}
	aria-pressed={selected}
	class={cn(
		'group relative aspect-square cursor-pointer overflow-hidden border transition-all hover:ring-1 hover:ring-primary/20',
		selected
			? 'border-primary bg-primary/5 ring-2 ring-primary/20'
			: 'border-transparent hover:border-muted-foreground/30'
	)}
	onclick={() => onselect(file)}
>
	<div class="flex h-full w-full items-center justify-center bg-muted">
		{#if src && !failed}
			<div class="relative h-full w-full">
				<img
					{src}
					alt=""
					loading="lazy"
					class="absolute inset-0 h-full w-full object-cover"
					onerror={() => (failed = true)}
				/>
			</div>
		{:else}
			<FileText class="h-12 w-12 text-muted-foreground" aria-hidden="true" />
		{/if}
	</div>
	<div class="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/60 to-transparent p-2">
		<p class="truncate font-medium text-[10px] text-white">{file.name}</p>
	</div>
</button>
