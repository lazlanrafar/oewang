<script lang="ts">
	import { Input } from '../../atoms/input/index.js';
	import * as InputGroup from '../input-group/index.js';
	import { cn } from '$lib/utils.js';

	/*
	 * Ported from the old app's molecules/currency-input.tsx, with one change
	 * that is not negotiable: the value is a decimal string, never a number.
	 *
	 * The old component held `value: number` and called `parseFloat` on every
	 * keystroke, which is exactly the rounding this rewrite forbids (D12).
	 * Here the bound value is the string the API expects, and only the
	 * display is formatted.
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

	let focused = $state(false);

	const grouped = $derived.by(() => {
		if (value === '' || value === '-') return value;
		const [whole, fraction] = value.split('.');
		const sign = whole.startsWith('-') ? '-' : '';
		const digits = whole.replace('-', '').replace(/^0+(?=\d)/, '');
		const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
		return fraction === undefined
			? `${sign}${withSeparators}`
			: `${sign}${withSeparators},${fraction}`;
	});

	/** While focused the raw string is edited; the grouped form is for reading. */
	const shown = $derived(focused ? value : grouped);

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		const typed = event.currentTarget.value.replace(/\./g, '').replace(',', '.');
		if (!/^-?\d*\.?\d*$/.test(typed)) {
			// Reject the keystroke rather than silently dropping characters.
			event.currentTarget.value = shown;
			return;
		}
		const [whole, fraction] = typed.split('.');
		value = fraction === undefined ? whole : `${whole}.${fraction.slice(0, decimals)}`;
		onValueChange?.(value);
	}
</script>

<InputGroup.Root class={cn(className)}>
	<InputGroup.Addon>
		<InputGroup.Text>{symbol}</InputGroup.Text>
	</InputGroup.Addon>
	<Input
		{id}
		{placeholder}
		{disabled}
		inputmode="decimal"
		data-slot="input-group-control"
		class="font-mono"
		value={shown}
		oninput={handleInput}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
	/>
</InputGroup.Root>
