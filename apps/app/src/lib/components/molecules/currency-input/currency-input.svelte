<script lang="ts">
	import * as InputGroup from '../input-group/index.js';
	import { cn } from '$lib/utils.js';

	/*
	 * Ported from the old app's molecules/currency-input.tsx, with one change
	 * that is not negotiable: the value is a decimal string, never a number.
	 *
	 * The old component held `value: number` and called `parseFloat` on every
	 * keystroke, which is exactly the rounding this rewrite forbids (D12).
	 * Here the bound value is the string the API expects, `87500`, and only
	 * the display is grouped.
	 *
	 * Grouping happens on every keystroke rather than on blur, so the number
	 * reads as a number while it is being typed. That means rewriting the
	 * field's own text mid-edit, which moves the caret to the end unless it is
	 * put back: `caretAfterDigits` counts the digits before the caret and
	 * finds that spot again in the regrouped string, so typing in the middle
	 * of 1.234.567 does not throw you to the end.
	 */
	let {
		value = $bindable(''),
		onValueChange,
		symbol = 'Rp',
		decimals = 0,
		class: className,
		id,
		placeholder = '0',
		disabled = false
	}: {
		/** A decimal string, as the API takes it. Empty means unset. */
		value?: string;
		/** Called with the new decimal string, for callers that cannot bind. */
		onValueChange?: (value: string) => void;
		symbol?: string;
		decimals?: number;
		class?: string;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	/** `-1234.5` reads as `-1.234,5`: dots group, the comma is the decimal. */
	function group(raw: string): string {
		if (raw === '' || raw === '-') return raw;
		const [whole, fraction] = raw.split('.');
		const sign = whole.startsWith('-') ? '-' : '';
		const digits = whole.replace('-', '').replace(/^0+(?=\d)/, '');
		const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
		if (fraction === undefined) return `${sign}${grouped}`;
		// A trailing separator survives, so typing `1234,` does not undo itself.
		return `${sign}${grouped},${fraction}`;
	}

	const shown = $derived(group(value));

	const digitCount = (text: string) => (text.match(/\d/g) ?? []).length;

	/** The index in `text` that sits after `count` digits. */
	function caretAfterDigits(text: string, count: number): number {
		if (count === 0) return text.search(/\d/) === -1 ? text.length : text.search(/\d/);
		let seen = 0;
		for (let i = 0; i < text.length; i += 1) {
			if (/\d/.test(text[i])) {
				seen += 1;
				if (seen === count) return i + 1;
			}
		}
		return text.length;
	}

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const el = event.currentTarget;
		const before = digitCount(el.value.slice(0, el.selectionStart ?? el.value.length));
		const typed = el.value.replace(/\./g, '').replace(',', '.');

		if (!/^-?\d*\.?\d*$/.test(typed)) {
			// Reject the keystroke rather than silently dropping characters.
			el.value = shown;
			return;
		}

		const [whole, fraction] = typed.split('.');
		const next = fraction === undefined ? whole : `${whole}.${fraction.slice(0, decimals)}`;
		value = next;
		onValueChange?.(next);

		const formatted = group(next);
		el.value = formatted;
		const caret = caretAfterDigits(formatted, before);
		el.setSelectionRange(caret, caret);
	}
</script>

<InputGroup.Root class={cn(className)}>
	<InputGroup.Addon>
		<InputGroup.Text>{symbol}</InputGroup.Text>
	</InputGroup.Addon>
	<InputGroup.Input
		{id}
		{placeholder}
		{disabled}
		inputmode="decimal"
		class="font-mono"
		value={shown}
		oninput={handleInput}
	/>
</InputGroup.Root>
