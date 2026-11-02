<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	import { buttonVariants } from '../button/index.js';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	/*
	 * Ported from the old app's atoms/calendar.tsx, squared (D52).
	 *
	 * A day is 32px, the grid is seven of them, and the selected day inverts.
	 * The month heading sits between two ghost buttons, as the old one does.
	 */
	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = 'short',
		...restProps
	}: WithoutChildrenOrChild<CalendarPrimitive.RootProps> = $props();
</script>

<CalendarPrimitive.Root
	bind:ref
	bind:value={value as never}
	bind:placeholder
	{weekdayFormat}
	data-slot="calendar"
	class={cn('p-3', className)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<CalendarPrimitive.Header class="relative flex w-full items-center justify-between pt-1">
			<CalendarPrimitive.PrevButton
				class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7')}
			>
				<ChevronLeft class="size-4" />
			</CalendarPrimitive.PrevButton>
			<CalendarPrimitive.Heading class="text-body font-medium" />
			<CalendarPrimitive.NextButton
				class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7')}
			>
				<ChevronRight class="size-4" />
			</CalendarPrimitive.NextButton>
		</CalendarPrimitive.Header>

		<div class="mt-4 flex flex-col gap-4">
			{#each months as month (month.value)}
				<CalendarPrimitive.Grid class="w-full border-collapse select-none">
					<CalendarPrimitive.GridHead>
						<CalendarPrimitive.GridRow class="flex">
							{#each weekdays as weekday (weekday)}
								<CalendarPrimitive.HeadCell
									class="text-subtle text-small w-8 font-normal"
								>
									{weekday.slice(0, 2)}
								</CalendarPrimitive.HeadCell>
							{/each}
						</CalendarPrimitive.GridRow>
					</CalendarPrimitive.GridHead>
					<CalendarPrimitive.GridBody>
						{#each month.weeks as week (week)}
							<CalendarPrimitive.GridRow class="mt-2 flex w-full">
								{#each week as date (date)}
									<CalendarPrimitive.Cell {date} month={month.value} class="p-0">
										<CalendarPrimitive.Day
											class={cn(
												'text-body hover:bg-accent flex size-8 items-center justify-center font-normal',
												'data-selected:bg-primary data-selected:text-primary-foreground',
												'data-today:font-medium data-outside-month:text-subtle data-disabled:opacity-40'
											)}
										/>
									</CalendarPrimitive.Cell>
								{/each}
							</CalendarPrimitive.GridRow>
						{/each}
					</CalendarPrimitive.GridBody>
				</CalendarPrimitive.Grid>
			{/each}
		</div>
	{/snippet}
</CalendarPrimitive.Root>
