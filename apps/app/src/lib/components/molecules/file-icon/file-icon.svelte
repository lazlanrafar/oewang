<script lang="ts">
	/**
	 * A file's type as an icon, as the old app's `FileIcon` drew it: an image,
	 * a film, a document or a plain file. One copy here; the old app kept
	 * three.
	 */
	import FileIcon from '@lucide/svelte/icons/file';
	import FileText from '@lucide/svelte/icons/file-text';
	import Film from '@lucide/svelte/icons/film';
	import ImageIcon from '@lucide/svelte/icons/image';

	import { cn } from '$lib/utils.js';

	let { type, class: className }: { type: string; class?: string } = $props();

	const Icon = $derived(
		type.startsWith('image/')
			? ImageIcon
			: type.startsWith('video/')
				? Film
				: type === 'application/pdf'
					? FileText
					: FileIcon
	);
</script>

<Icon class={cn('h-4 w-4', className)} aria-hidden="true" />
