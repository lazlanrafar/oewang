<script lang="ts" module>
	import type { DateRange } from 'bits-ui';

	export type { DateRange };

	export type RangePreset =
		| 'today'
		| 'this-week'
		| 'this-month'
		| 'last-month'
		| 'this-year'
		| 'custom';
</script>

<script lang="ts">
	/**
	 * The date range the transactions page filters by.
	 *
	 * A list of presets beside a two-month calendar, which is how the live app
	 * builds it. The presets are what people actually use; the calendar is for
	 * the one time a month they need something else.
	 *
	 * The value is a `DateValue` range, not a `Date`: a transaction happens on
	 * a calendar day in the workspace's zone, and `Date` would drag the
	 * browser's zone into it and move the boundary (D12 is about money, this
	 * is the same argument about days).
	 */
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import {
		CalendarDate,
		DateFormatter,
		endOfMonth,
		endOfWeek,
		getLocalTimeZone,
		startOfMonth,
		startOfWeek,
		startOfYear,
		today,
		type DateValue
	} from '@internationalized/date';

	import { Button } from '../../atoms/button/index.js';
	import * as Popover from '../../atoms/popover/index.js';
	import { RangeCalendar } from '../../atoms/range-calendar/index.js';
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(),
		locale = 'en-GB',
		class: className,
		id
	}: {
		value?: DateRange;
		locale?: string;
		class?: string;
		id?: string;
	} = $props();

	let open = $state(false);

	// Derived, not captured: a caller that changes locale gets a formatter and
	// week boundaries in the new one.
	const formatter = $derived(
		new DateFormatter(locale, { day: '2-digit', month: 'short', year: 'numeric' })
	);
	const now = today(getLocalTimeZone());

	const presets: Array<{ key: RangePreset; label: string; range: () => DateRange }> = $derived([
		{ key: 'today', label: 'Today', range: () => ({ start: now, end: now }) },
		{
			key: 'this-week',
			label: 'This week',
			range: () => ({ start: startOfWeek(now, locale), end: endOfWeek(now, locale) })
		},
		{
			key: 'this-month',
			label: 'This month',
			range: () => ({ start: startOfMonth(now), end: endOfMonth(now) })
		},
		{
			key: 'last-month',
			label: 'Last month',
			range: () => {
				const previous = now.subtract({ months: 1 });
				return { start: startOfMonth(previous), end: endOfMonth(previous) };
			}
		},
		{
			key: 'this-year',
			label: 'This year',
			range: () => ({ start: startOfYear(now), end: new CalendarDate(now.year, 12, 31) })
		}
	]);

	const label = $derived.by(() => {
		if (!value?.start) return 'Pick a date range';
		const start = formatter.format(value.start.toDate(getLocalTimeZone()));
		if (!value.end) return start;
		const end = formatter.format(value.end.toDate(getLocalTimeZone()));
		return start === end ? start : `${start} - ${end}`;
	});

	/** Which preset the current range is, so the list can show it as active. */
	const activePreset = $derived.by(() => {
		if (!value?.start || !value?.end) return undefined;
		return presets.find(({ range }) => {
			const candidate = range();
			return same(candidate.start, value?.start) && same(candidate.end, value?.end);
		})?.key;
	});

	const same = (a?: DateValue | null, b?: DateValue | null) =>
		a !== undefined && a !== null && b !== undefined && b !== null && a.compare(b) === 0;

	function apply(range: DateRange) {
		value = range;
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" {id} class={cn('justify-start gap-2', className)} {...props}>
				<CalendarIcon />
				{label}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<div class="flex flex-col sm:flex-row">
			<div class="flex flex-row gap-1 border-b p-2 sm:flex-col sm:border-r sm:border-b-0">
				{#each presets as preset (preset.key)}
					<Button
						variant={activePreset === preset.key ? 'secondary' : 'ghost'}
						size="sm"
						class="justify-start"
						onclick={() => apply(preset.range())}
					>
						{preset.label}
					</Button>
				{/each}
				{#if value?.start}
					<Button
						variant="ghost"
						size="sm"
						class="text-subtle justify-start"
						onclick={() => apply({ start: undefined, end: undefined })}
					>
						Clear
					</Button>
				{/if}
			</div>
			<RangeCalendar bind:value {locale} />
		</div>
	</Popover.Content>
</Popover.Root>
