<script lang="ts">
	/**
	 * A registered user, found by email or name (US-085). Too many users to
	 * load whole, so each search asks the console's own server route, which
	 * asks the API (D5); the list shows the matches. The chosen user stays in
	 * the list whatever is typed next, so the trigger keeps its label.
	 */
	import { Select, type SelectItem } from '../select/index.js';

	let {
		value = $bindable(),
		name,
		placeholder,
		searchPlaceholder,
		ariaLabel,
		disabled = false,
		id,
		class: className
	}: {
		value?: string;
		name?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
	} = $props();

	let found = $state<SelectItem[]>([]);
	let chosen = $state<SelectItem | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = 0;

	const items = $derived(
		chosen ? [chosen, ...found.filter((item) => item.value !== chosen?.value)] : found
	);

	function search(term: string) {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			// Only the latest answer counts: a slow early one must not replace it.
			const mine = ++asked;
			const response = await fetch(`/console/users/search?search=${encodeURIComponent(term.trim())}`);
			if (!response.ok || mine !== asked) return;
			const users: { id: string; email: string; name: string | null }[] = await response.json();
			found = users.map((user) => ({
				value: user.id,
				label: user.name ? `${user.email} · ${user.name}` : user.email
			}));
		}, 250);
	}

	function pick(id: string) {
		chosen = items.find((item) => item.value === id) ?? null;
	}
</script>

<Select
	{id}
	{items}
	bind:value
	{name}
	{placeholder}
	{searchPlaceholder}
	{ariaLabel}
	{disabled}
	onSearch={search}
	onChange={pick}
	class={className}
/>
