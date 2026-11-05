<script lang="ts">
	/**
	 * One tab per analysis in the conversation (D88).
	 *
	 * Ported from the old canvas's tab strip. Selecting a tab writes the URL,
	 * like everything else about the panel, so the back button walks the tabs
	 * and a reload keeps the one that was open (UI-8). The old per-tab close
	 * is gone: it hid a tab in memory only, which a reload undid.
	 */
	import { t } from '$lib/i18n';
	import type { ArtifactEntry } from '$lib/artifacts';
	import { cn } from '$lib/utils.js';

	import { artifactTitle } from './artifact-title.js';

	let {
		entries,
		activeId,
		onSelect
	}: {
		entries: ArtifactEntry[];
		activeId: string | null;
		onSelect: (entry: ArtifactEntry) => void;
	} = $props();
</script>

{#if entries.length > 1}
	<div class="overflow-x-auto" role="tablist" aria-label={t('canvas.tabs_label')}>
		<div class="flex min-w-max">
			{#each entries as entry (entry.id)}
				<button
					type="button"
					role="tab"
					aria-selected={entry.id === activeId}
					class={cn(
						'text-small border-b-2 px-4 py-2.5 whitespace-nowrap transition-colors',
						entry.id === activeId
							? 'border-foreground text-foreground'
							: 'text-subtle hover:text-foreground border-transparent'
					)}
					onclick={() => onSelect(entry)}
				>
					{artifactTitle(entry)}
				</button>
			{/each}
		</div>
	</div>
{/if}
