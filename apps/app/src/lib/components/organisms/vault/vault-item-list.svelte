<script lang="ts">
	/**
	 * The vault as a table, the old app's `VaultItemList`: thumbnail and name,
	 * the format, the size and the date. A row is a link-like control that
	 * opens the file's sheet.
	 */
	import FileText from '@lucide/svelte/icons/file-text';

	import { formatBytes, thumbnailSrc, type VaultListFile } from '$lib/files.js';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils.js';

	let {
		files,
		selectedId,
		onselect
	}: {
		files: VaultListFile[];
		selectedId?: string;
		onselect: (file: VaultListFile) => void;
	} = $props();
</script>

<div class="min-w-full">
	<table class="w-full text-sm">
		<thead>
			<tr class="h-10 border-b text-muted-foreground text-xs uppercase">
				<th class="px-4 text-left font-medium">{t('vault.columns.filename')}</th>
				<th class="px-4 text-left font-medium">{t('vault.columns.format')}</th>
				<th class="px-4 text-right font-medium">{t('vault.columns.size')}</th>
				<th class="px-4 text-right font-medium">{t('vault.columns.date')}</th>
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each files as file (file.id)}
				{@const src = thumbnailSrc(file)}
				<tr
					class={cn(
						'h-14 cursor-pointer transition-colors hover:bg-muted/50',
						selectedId === file.id && 'bg-primary/5'
					)}
					onclick={() => onselect(file)}
				>
					<td class="px-4">
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border bg-muted">
								{#if src}
									<img {src} alt="" loading="lazy" class="h-full w-full object-cover" />
								{:else}
									<FileText class="h-5 w-5 text-muted-foreground" aria-hidden="true" />
								{/if}
							</div>
							<!-- The name is the row's keyboard target; the row's own
							     click is a convenience for the pointer. -->
							<button
								type="button"
								class="max-w-[200px] truncate text-left font-medium"
								onclick={(event) => {
									event.stopPropagation();
									onselect(file);
								}}
							>
								{file.name}
							</button>
						</div>
					</td>
					<td class="px-4 font-medium text-primary">{file.type}</td>
					<td class="px-4 text-right tabular-nums">{formatBytes(file.size)}</td>
					<td class="px-4 text-right text-muted-foreground">
						{new Date(file.created_at).toLocaleDateString()}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
