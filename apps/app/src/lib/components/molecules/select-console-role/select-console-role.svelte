<script lang="ts">
	/**
	 * The console role picker (US-085). Roles are data, so this is the app's
	 * picker rather than a native `<select>` (D79). The page passes the roles
	 * it loaded; `name` posts the chosen id with a form action.
	 */
	import { Select } from '../select/index.js';

	let {
		roles,
		value = $bindable(),
		name,
		placeholder,
		searchPlaceholder,
		ariaLabel,
		disabled = false,
		id,
		class: className
	}: {
		roles: { id: string; name: string }[];
		value?: string;
		name?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const items = $derived(roles.map((role) => ({ value: role.id, label: role.name })));
</script>

<Select {id} {items} bind:value {name} {placeholder} {searchPlaceholder} {ariaLabel} {disabled} class={className} />
