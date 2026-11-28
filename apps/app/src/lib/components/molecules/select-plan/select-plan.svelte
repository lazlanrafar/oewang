<script lang="ts">
	/**
	 * The plan picker (PLN-3, OEW-131). Plans are data, so this is the app's
	 * picker rather than a native `<select>` (D79). The page passes the plans
	 * it loaded; `name` posts the chosen id with a form action.
	 */
	import { Select } from '../select/index.js';

	let {
		plans,
		value = $bindable(),
		name,
		placeholder,
		searchPlaceholder,
		ariaLabel,
		disabled = false,
		id,
		class: className
	}: {
		plans: { id: string; name: string }[];
		value?: string;
		name?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const items = $derived(plans.map((plan) => ({ value: plan.id, label: plan.name })));
</script>

<Select {id} {items} bind:value {name} {placeholder} {searchPlaceholder} {ariaLabel} {disabled} class={className} />
