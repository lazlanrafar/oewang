<script lang="ts">
	/**
	 * The three figures above the accounts table.
	 *
	 * Local rather than built on `molecules/stat-card`: that card renders its
	 * value `font-mono text-xl` and carries a change indicator, where this one
	 * is a 10px tracked label over a serif figure at `text-3xl` and has no
	 * change to show. Measured on the live page, class for class.
	 *
	 * Every figure arrives formatted. This component does no arithmetic on
	 * money and never sees a number (D12, D27).
	 */
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	let {
		total,
		count,
		counted,
		unconverted = 0,
		class: className
	}: {
		/** The workspace-currency total, already formatted. */
		total: string;
		count: number;
		counted: number;
		/** How many wallets had no rate today, so the total can say it is partial. */
		unconverted?: number;
		class?: string;
	} = $props();
</script>

<div class={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
	<div class="border-border flex flex-col gap-1 border p-6">
		<span class="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
			{t('accounts.total_balance')}
		</span>
		<span class="mt-1 font-serif text-3xl font-medium tracking-tight tabular-nums">
			{total}
		</span>
		{#if unconverted > 0}
			<!-- An honest partial figure beats a wrong whole one: a wallet whose
			     currency has no rate today is left out, and the card says so. -->
			<span class="text-subtle text-caption">
				{t('accounts.total_partial', { count: unconverted })}
			</span>
		{/if}
	</div>

	<div class="border-border flex flex-col gap-1 border p-6">
		<span class="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
			{t('accounts.count')}
		</span>
		<span class="mt-1 font-serif text-3xl font-medium tracking-tight tabular-nums">{count}</span>
	</div>

	<div class="border-border flex flex-col gap-1 border p-6">
		<!-- "Counted in totals", not "Active": the schema has no such flag, and
		     this is the number that explains the total beside it. -->
		<span class="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
			{t('accounts.counted')}
		</span>
		<span class="text-green mt-1 font-serif text-3xl font-medium tracking-tight tabular-nums">
			{counted}
		</span>
	</div>
</div>
