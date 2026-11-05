<script lang="ts">
	import { RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	import { buttonVariants } from '../button/index.js';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	/*
	 * The two-month range calendar the date filter opens.
	 *
	 * Days between the ends are tinted rather than outlined, and the two ends
	 * invert, so a range reads at a glance without a radius to shape it (D52).
	 *
	 * While only one end is set, the days between it and the day under the
	 * pointer carry the same tint (`data-highlighted`), so the range being
	 * drawn is visible before the second click rather than after it.
	 */
	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = 'short',
		numberOfMonths = 2,
		...restProps
	}: WithoutChildrenOrChild<RangeCalendarPrimitive.RootProps> = $props();
</script>

<RangeCalendarPrimitive.Root
	bind:ref
	bind:value={value as never}
	bind:placeholder
	{weekdayFormat}
	{numberOfMonths}
	data-slot="range-calendar"
	class={cn('p-3', className)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<RangeCalendarPrimitive.Header class="relative flex w-full items-center justify-between pt-1">
			<RangeCalendarPrimitive.PrevButton
				class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7')}
			>
				<ChevronLeft class="size-4" />
			</RangeCalendarPrimitive.PrevButton>
			<RangeCalendarPrimitive.Heading class="text-body font-medium" />
			<RangeCalendarPrimitive.NextButton
				class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7')}
			>
				<ChevronRight class="size-4" />
			</RangeCalendarPrimitive.NextButton>
		</RangeCalendarPrimitive.Header>

		<div class="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-6">
			{#each months as month (month.value)}
				<RangeCalendarPrimitive.Grid class="w-full border-collapse select-none">
					<RangeCalendarPrimitive.GridHead>
						<RangeCalendarPrimitive.GridRow class="flex">
							{#each weekdays as weekday (weekday)}
								<RangeCalendarPrimitive.HeadCell
									class="text-subtle text-small w-8 font-normal"
								>
									{weekday.slice(0, 2)}
								</RangeCalendarPrimitive.HeadCell>
							{/each}
						</RangeCalendarPrimitive.GridRow>
					</RangeCalendarPrimitive.GridHead>
					<RangeCalendarPrimitive.GridBody>
						{#each month.weeks as week (week)}
							<RangeCalendarPrimitive.GridRow class="mt-2 flex w-full">
								{#each week as date (date)}
									<RangeCalendarPrimitive.Cell
										{date}
										month={month.value}
										class="data-selected:bg-accent data-highlighted:bg-accent p-0"
									>
										<RangeCalendarPrimitive.Day
											class={cn(
												'text-body hover:bg-accent flex size-8 items-center justify-center font-normal',
												'data-highlighted:bg-accent',
												'data-selection-start:bg-primary data-selection-start:text-primary-foreground',
												'data-selection-end:bg-primary data-selection-end:text-primary-foreground',
												'data-today:font-medium data-outside-month:text-subtle data-disabled:opacity-40'
											)}
										/>
									</RangeCalendarPrimitive.Cell>
								{/each}
							</RangeCalendarPrimitive.GridRow>
						{/each}
					</RangeCalendarPrimitive.GridBody>
				</RangeCalendarPrimitive.Grid>
			{/each}
		</div>
	{/snippet}
</RangeCalendarPrimitive.Root>
