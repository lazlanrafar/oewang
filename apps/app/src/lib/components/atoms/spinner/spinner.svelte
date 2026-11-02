<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { SVGAttributes } from 'svelte/elements';

	// Ported from the old app's atoms/spinner.tsx, path and all.
	let {
		class: className,
		size = 20,
		...restProps
	}: Omit<SVGAttributes<SVGElement>, 'width' | 'height'> & { size?: number } = $props();
</script>

<svg
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	viewBox="0 0 24 24"
	stroke-linecap="round"
	stroke-linejoin="round"
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	class={cn('animate-spin stroke-[#878787]', className)}
	role="img"
	aria-label="Loading"
	{...restProps}
>
	<path
		d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"
	/>
</svg>
