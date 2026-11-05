<script lang="ts">
	/**
	 * One day, picked from the app's own calendar.
	 *
	 * The counterpart of `molecules/date-range-picker`: same trigger, same
	 * panel, one date instead of two. It exists because a transaction's date
	 * was the last native control left in the form, and the operating system
	 * draws that one in its own type, at its own size, with its own idea of
	 * what a date looks like — the same argument that keeps a dynamic list
	 * off a native `<select>` (D79).
	 *
	 * The value is an ISO `YYYY-MM-DD` string, not a `DateValue` or a `Date`:
	 * that is what a transaction carries on the wire, and converting it twice
	 * at every call site is how a day ends up shifted by a time zone. The
	 * conversion happens here, once.
	 */
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import {
		DateFormatter,
		getLocalTimeZone,
		parseDate,
		today,
		type DateValue
	} from '@internationalized/date';

	import { Button } from '../../atoms/button/index.js';
	import { Calendar } from '../../atoms/calendar/index.js';
	import * as Popover from '../../atoms/popover/index.js';
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(''),
		locale = 'en-GB',
		placeholder = 'Pick a date',
		onValueChange,
		disabled = false,
		name,
		id,
		class: className
	}: {
		/** ISO `YYYY-MM-DD`, or empty for no date. */
		value?: string;
		locale?: string;
		/** The trigger's text while no date is set. Passed in (UI-1). */
		placeholder?: string;
		/** Called with the new ISO string, after `value` has moved. */
		onValueChange?: (value: string) => void;
		disabled?: boolean;
		/** Posts the value as a hidden input, for a SvelteKit form action. */
		name?: string;
		id?: string;
		class?: string;
	} = $props();

	let open = $state(false);

	// Derived, not captured: a caller that changes locale gets the new one.
	const formatter = $derived(
		new DateFormatter(locale, { day: '2-digit', month: 'short', year: 'numeric' })
	);

	/**
	 * A half-typed or malformed string is not a date, and it is not an error
	 * worth throwing out of a render either: the trigger shows the
	 * placeholder and the calendar opens on this month.
	 */
	const selected = $derived.by(() => {
		if (!value) return undefined;
		try {
			return parseDate(value);
		} catch {
			return undefined;
		}
	});

	const label = $derived(
		selected ? formatter.format(selected.toDate(getLocalTimeZone())) : placeholder
	);

	function choose(next: DateValue | undefined) {
		value = next ? next.toString() : '';
		onValueChange?.(value);
		if (next) open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				variant="outline"
				{disabled}
				{...props}
				data-slot="date-picker-trigger"
				class={cn('w-full justify-start gap-2 font-normal', className)}
				{id}
			>
				<CalendarIcon class="text-subtle size-4 shrink-0" />
				<span class={cn('truncate', !selected && 'text-subtle')}>{label}</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar
			type="single"
			value={selected}
			placeholder={selected ?? today(getLocalTimeZone())}
			{locale}
			onValueChange={(next) => choose(next as DateValue | undefined)}
		/>
	</Popover.Content>
</Popover.Root>

{#if name}
	<!-- The trigger is a button, so the value needs its own input to post. -->
	<input type="hidden" {name} value={value ?? ''} />
{/if}
