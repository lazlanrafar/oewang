<script lang="ts" module>
	export type UploadedFile = {
		id: string;
		name: string;
		type: string;
		size: number;
		/** Whether the API has a preview for it (D91). Absent means not known yet. */
		thumbnail?: boolean | null;
	};
</script>

<script lang="ts">
	/**
	 * The attachments block of the old app's transaction form sheet.
	 *
	 * The label, the attached files as a grid of square tiles, and below them
	 * a dashed box: a click opens the vault picker, a drop uploads straight to
	 * the vault. The component does not own the transport: `upload`, the
	 * picker's list and the tiles' previews are handed in, so the routes, the
	 * limits and the strings stay in `$lib/files.ts` and this stays a
	 * design-system piece.
	 */
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import { toast } from 'svelte-sonner';
	import type { ComponentProps } from 'svelte';

	import { FilePicker } from '../file-picker/index.js';
	import { FileTile } from '../file-tile/index.js';
	import { cn } from '$lib/utils.js';

	type TileProps = Omit<ComponentProps<typeof FileTile>, 'file' | 'onopen' | 'onremove' | 'class'>;
	type PickerProps = Omit<ComponentProps<typeof FilePicker>, 'open' | 'selected' | 'onconfirm'>;

	let {
		files = $bindable([]),
		upload,
		accept = [],
		name,
		label,
		browseLabel,
		prompt,
		hint,
		busyLabel,
		errorMessage,
		tile,
		picker,
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
		label: string;
		browseLabel: string;
		prompt: string;
		hint?: string;
		busyLabel: string;
		/** What a failed upload says, which is the caller's to map (UI-1). */
		errorMessage: (error: unknown) => string;
		tile: TileProps;
		picker: PickerProps;
		disabled?: boolean;
		class?: string;
	} = $props();

	let uploading = $state(0);
	let dragging = $state(false);
	let pickerOpen = $state(false);

	async function dropped(list: FileList | null | undefined) {
		const chosen = Array.from(list ?? []);
		for (const file of chosen) {
			if (accept.length > 0 && !accept.includes(file.type)) {
				toast.error(errorMessage(new Error('UNSUPPORTED_FILE_TYPE')));
				continue;
			}
			uploading += 1;
			try {
				const stored = await upload(file, () => {});
				files = [...files, stored];
			} catch (error) {
				// The API refuses a file whose bytes are not what it said they
				// were, and leaves nothing behind when it does.
				toast.error(errorMessage(error));
			} finally {
				uploading -= 1;
			}
		}
	}

	function remove(file: UploadedFile) {
		// Detaches it. The file itself stays in the vault (VLT-5).
		files = files.filter((candidate) => candidate.id !== file.id);
	}

	function picked(chosen: UploadedFile[]) {
		files = chosen;
	}
</script>

<div class={cn('space-y-3', className)}>
	<div class="flex items-center justify-between">
		<span class="font-medium text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
	</div>

	{#if files.length > 0}
		<div class="mb-4 grid grid-cols-3 gap-2">
			{#each files as file (file.id)}
				<FileTile {file} {...tile} onremove={disabled ? undefined : remove} />
			{/each}
		</div>
	{/if}

	<button
		type="button"
		{disabled}
		class={cn(
			'group relative mt-2 flex w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden border-2 border-dashed bg-muted/5 px-6 py-10 transition-all hover:border-border/60 hover:bg-muted/10 disabled:pointer-events-none disabled:opacity-50',
			dragging && 'border-primary/50 bg-muted/20'
		)}
		ondragover={(event) => {
			event.preventDefault();
			dragging = true;
		}}
		ondragleave={(event) => {
			event.preventDefault();
			dragging = false;
		}}
		ondrop={(event) => {
			event.preventDefault();
			dragging = false;
			dropped(event.dataTransfer?.files);
		}}
		onclick={() => (pickerOpen = true)}
	>
		<span
			class="rounded-full border border-border/20 bg-background p-2.5 shadow-sm transition-transform group-hover:scale-110"
		>
			<Paperclip
				class="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary"
				aria-hidden="true"
			/>
		</span>
		<span class="text-center text-[11px] text-muted-foreground leading-relaxed">
			<span class="font-medium text-foreground">{browseLabel}</span>
			{prompt}
			{#if hint}
				<br />
				<span class="text-[10px] opacity-60">{hint}</span>
			{/if}
		</span>

		{#if uploading > 0}
			<span class="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
				<span class="animate-pulse font-medium text-xs">{busyLabel}</span>
			</span>
		{/if}
	</button>

	<FilePicker bind:open={pickerOpen} selected={files} onconfirm={picked} {...picker} />

	{#if name}
		<!-- Every attached file's id, so the form submits the whole set. -->
		{#each files as file (file.id)}
			<input type="hidden" {name} value={file.id} />
		{/each}
	{/if}
</div>
