<script lang="ts">
	/**
	 * Ported from the old app's debt-bulk-edit-bar: a floating bar 40px off
	 * the bottom, centred, with the count, Deselect, Delete and a close.
	 *
	 * Delete is the bar's only action, as it was. Settling several debts at
	 * once is the contact sheet's Settle all, because a bulk payment pays one
	 * person from one account (DEBT-6).
	 */
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import * as Tooltip from '../../atoms/tooltip/index.js';
	import { t } from '$lib/i18n';

	let {
		count,
		onClear,
		onDelete,
		deleting = false
	}: {
		count: number;
		onClear: () => void;
		onDelete: () => void;
		deleting?: boolean;
	} = $props();
</script>

{#if count > 0}
	<div class="pointer-events-none fixed inset-x-0 bottom-10 z-50 flex justify-center">
		<div
			class="border-border/50 bg-background/80 pointer-events-auto flex min-w-[320px] items-center justify-between gap-4 border px-6 py-2 shadow-2xl backdrop-blur-xl"
		>
			<div class="flex items-center gap-3">
				<span class="text-foreground text-sm font-medium">{t('debts.bulk.selected', { count })}</span>
				<div class="bg-border mx-1 h-4 w-px"></div>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
					onclick={onClear}
				>
					{t('debts.bulk.deselect')}
				</button>
			</div>

			<div class="flex items-center gap-2">
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<!-- The tooltip's props first, ours after, or its onclick replaces ours. -->
								<Button
									{...props}
									variant="ghost"
									size="sm"
									class="text-destructive hover:bg-destructive/10 hover:text-destructive gap-2"
									disabled={deleting}
									onclick={onDelete}
								>
									{#if deleting}
										<Spinner size={14} />
									{:else}
										<Trash2 class="h-3.5 w-3.5" />
									{/if}
									{t('debts.actions.delete')}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content class="text-xs">{t('debts.bulk.delete_tooltip')}</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>

				<div class="bg-border mx-1 h-4 w-px"></div>

				<button
					type="button"
					class="hover:bg-muted rounded-md p-1 transition-colors"
					aria-label={t('debts.bulk.close')}
					onclick={onClear}
				>
					<X class="text-muted-foreground h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
{/if}
