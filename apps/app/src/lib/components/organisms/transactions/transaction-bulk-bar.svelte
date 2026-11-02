<script lang="ts">
	/**
	 * Ported from the old app's transaction-bulk-edit-bar.
	 *
	 * A floating bar rather than a strip above the table: it sits 40px off the
	 * bottom, centred, over whatever the table is showing, so a selection made
	 * at the end of a long list is still actionable without scrolling back.
	 */
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '../../atoms/button/index.js';
	import * as Tooltip from '../../atoms/tooltip/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { cn } from '$lib/utils.js';

	let {
		count,
		onClear,
		onDelete,
		onEditCategory,
		onReady,
		onExport,
		deleting = false,
		class: className
	}: {
		count: number;
		onClear: () => void;
		onDelete?: () => void;
		onEditCategory?: () => void;
		/** Flip the ready flag across the selection (TXN-14). */
		onReady?: () => void;
		onExport?: () => void;
		deleting?: boolean;
		class?: string;
	} = $props();
</script>

{#if count > 0}
	<div
		class={cn(
			'pointer-events-none fixed inset-x-0 bottom-10 z-50 flex justify-center',
			className
		)}
	>
		<div
			class="border-border/50 bg-background/80 pointer-events-auto flex min-w-[320px] items-center justify-between gap-4 border px-6 py-2 backdrop-blur-xl"
		>
			<div class="flex items-center gap-3">
				<span class="text-body font-medium">{count} selected</span>
				<div class="bg-border mx-1 h-4 w-px"></div>
				<button
					type="button"
					class="text-subtle text-small hover:text-foreground flex items-center gap-1.5 transition-colors"
					onclick={onClear}
				>
					Clear
				</button>
			</div>

			<div class="flex items-center gap-2">
				<Button size="sm" variant="ghost" class="text-small h-8 px-3" onclick={onEditCategory}>
					Edit category
				</Button>
				<Button size="sm" variant="ghost" class="text-small h-8 px-3" onclick={onReady}>
					Mark ready
				</Button>
				{#if onExport}
					<Button size="sm" variant="ghost" class="text-small h-8 px-3" onclick={onExport}>
						Export
					</Button>
				{/if}
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									size="sm"
									variant="ghost"
									class="text-destructive hover:bg-destructive/10 hover:text-destructive text-small h-8 gap-2 px-3"
									disabled={deleting}
									onclick={onDelete}
									{...props}
								>
									{#if deleting}
										<Spinner size={14} />
									{:else}
										<Trash2 class="size-3.5" />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content class="text-small">Delete selected transactions</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
				<div class="bg-border mx-1 h-4 w-px"></div>
				<button
					type="button"
					class="hover:bg-muted p-1 transition-colors"
					aria-label="Dismiss"
					onclick={onClear}
				>
					<X class="size-3.5" />
				</button>
			</div>
		</div>
	</div>
{/if}
