<script lang="ts">
	/**
	 * The one-off tidy of names already stored (D129): every transaction and
	 * item name whose tidied spelling differs, from → to, all ticked. What is
	 * ticked is submitted; the API works out each new name again, so this
	 * sends which rows and the name it showed, never the new one.
	 *
	 * Two empty states: nothing to change at all, and nothing ticked.
	 */
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import * as Empty from '$lib/components/molecules/empty';
	import { t } from '$lib/i18n';
	import type { TidyNameChange } from '$lib/server/ledger';

	let {
		open = false,
		onOpenChange,
		changes,
		saving = false,
		enhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Null while it could not be read. */
		changes: TidyNameChange[] | null;
		saving?: boolean;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const key = (change: TidyNameChange) => `${change.kind}:${change.id}`;

	let unticked = $state<Record<string, boolean>>({});
	// A fresh list starts with everything ticked.
	$effect(() => {
		void changes;
		unticked = {};
	});

	const list = $derived(changes ?? []);
	const ticked = $derived(list.filter((change) => !unticked[key(change)]));
	const allTicked = $derived(ticked.length === list.length);

	const progressive = (node: HTMLFormElement) => enhance?.(node);
</script>

<Sheet.Root {open} {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		<form method="POST" action="?/tidyNames" use:progressive class="flex h-full flex-col">
			{#each ticked as change (key(change))}
				<input
					type="hidden"
					name="change"
					value={JSON.stringify({ kind: change.kind, id: change.id, from: change.from })}
				/>
			{/each}

			<Sheet.Header class="bg-muted/5 shrink-0 border-b px-6 py-6 text-left">
				<Sheet.Title class="font-serif text-xl font-normal">{t('txn.tidy_names')}</Sheet.Title>
				<Sheet.Description>{t('txn.tidy_names_hint')}</Sheet.Description>
			</Sheet.Header>

			<div class="no-scrollbar flex-1 overflow-y-auto px-6 py-4">
				{#if changes === null}
					<p class="text-destructive text-small" role="alert">{t('txn.tidy_names_unavailable')}</p>
				{:else if list.length === 0}
					<Empty.Root class="h-full">
						<Empty.Header>
							<Empty.Title>{t('txn.tidy_names_none')}</Empty.Title>
							<Empty.Description>{t('txn.tidy_names_none_hint')}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{:else}
					<div class="flex items-center gap-2 border-b pb-3">
						<Checkbox
							id="tidy-all"
							checked={allTicked}
							indeterminate={!allTicked && ticked.length > 0}
							onCheckedChange={(on) =>
								(unticked = on ? {} : Object.fromEntries(list.map((c) => [key(c), true])))}
						/>
						<Label for="tidy-all">{t('txn.tidy_names_all')}</Label>
					</div>

					<ul class="divide-y">
						{#each list as change (key(change))}
							{@const id = `tidy-${change.kind}-${change.id}`}
							<li class="flex items-center gap-3 py-3">
								<Checkbox
									{id}
									checked={!unticked[key(change)]}
									onCheckedChange={(on) => (unticked = { ...unticked, [key(change)]: !on })}
								/>
								<Label for={id} class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
									<span class="text-subtle break-all">{change.from}</span>
									<ArrowRight class="text-subtle size-3.5 shrink-0" />
									<span class="break-all">{change.to}</span>
								</Label>
								{#if change.kind === 'item'}
									<Badge variant="outline">{t('txn.tidy_names_item')}</Badge>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if list.length > 0}
				<div class="bg-background mt-auto shrink-0 space-y-3 border-t p-6">
					{#if ticked.length === 0}
						<p class="text-subtle text-small" role="status">
							{t('txn.tidy_names_nothing_selected')}
						</p>
					{/if}
					<Button
						type="submit"
						size="caps"
						class="w-full"
						loading={saving}
						disabled={ticked.length === 0}
					>
						{t('txn.tidy_names_apply', { count: ticked.length })}
					</Button>
				</div>
			{/if}
		</form>
	</Sheet.Content>
</Sheet.Root>
