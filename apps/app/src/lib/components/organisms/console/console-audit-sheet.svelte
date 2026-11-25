<script lang="ts">
	/**
	 * One audit entry (CSL-12, US-085): who did what, when, and the record
	 * before and after, one field per row with the changed ones marked.
	 */
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { auditDiff, auditEntityHref } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleAuditEntry } from '$lib/server/console';
	import { cn } from '$lib/utils';

	import { actionName, entityName, whenLabel } from './console-audit-labels';

	let {
		open = false,
		onOpenChange,
		entry
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		entry: ConsoleAuditEntry | null;
	} = $props();

	const rows = $derived(entry ? auditDiff(entry.before, entry.after) : []);
	const href = $derived(entry ? auditEntityHref(entry.entity, entry.entity_id) : null);

	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root {open} {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[640px]">
		{#if entry}
			<Sheet.Header class="bg-muted/5 shrink-0 space-y-1 border-b p-6 text-left">
				<Sheet.Title class="font-serif text-xl font-normal">{actionName(entry.action)}</Sheet.Title>
				<Sheet.Description class="text-muted-foreground text-xs tabular-nums">
					{whenLabel(entry.created_at)}
				</Sheet.Description>
			</Sheet.Header>

			<div class="no-scrollbar flex-1 overflow-y-auto">
				<dl class="border-border/50 bg-muted/5 grid grid-cols-2 gap-6 border-b p-6">
					<div class="min-w-0 space-y-1">
						<dt class={capsLabel}>{t('console.audit.sheet.by')}</dt>
						<dd class="truncate text-sm">{entry.operator_email}</dd>
					</div>
					<div class="min-w-0 space-y-1">
						<dt class={capsLabel}>{t('console.audit.sheet.entity')}</dt>
						<dd class="flex items-center gap-2 text-sm">
							<span class="truncate">{entityName(entry.entity)}</span>
							{#if href}
								<Button variant="outline" size="caps" {href}>{t('console.audit.sheet.open_entity')}</Button>
							{/if}
						</dd>
					</div>
				</dl>

				<section class="p-6">
					{#if rows.length === 0}
						<p class="text-muted-foreground text-sm">{t('console.audit.sheet.no_fields')}</p>
					{:else}
						<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] text-xs">
							<span class="{capsLabel} pb-2">{t('console.audit.sheet.field')}</span>
							<span class="{capsLabel} pb-2">{t('console.audit.sheet.before')}</span>
							<span class="{capsLabel} pb-2">{t('console.audit.sheet.after')}</span>
							{#each rows as row (row.key)}
								{@const mark = cn('border-border/50 border-t py-2 pr-3 font-mono break-words', row.changed && 'bg-primary/5')}
								<span class={mark}>{row.key}</span>
								<span class={cn(mark, 'text-muted-foreground', row.changed && 'line-through')}>{row.before}</span>
								<span class={cn(mark, row.changed && 'font-medium')}>{row.after}</span>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
