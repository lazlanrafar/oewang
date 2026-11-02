<script lang="ts">
	import { Label } from '../../atoms/label/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let { class: className, ...restProps }: ComponentProps<typeof Label> = $props();
</script>

<Label
	data-slot="field-label"
	class={cn(
		'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
		className
	)}
	{...restProps}
/>
