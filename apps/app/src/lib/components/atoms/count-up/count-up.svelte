<script lang="ts" module>
	/**
	 * A figure that counts up, as a caller hands it over: the decimal string
	 * and how to print one. The formatter is the caller's because only the
	 * caller knows whether this is rupiah, a percentage or a byte count.
	 */
	export type Count = { value: string; format: (value: string) => string };
</script>

<script lang="ts">
	/**
	 * Ported from the old app's `CountUp` (overview cards and
	 * `DataTablePageCard`): a figure that counts from zero to its value over
	 * 0.8s with an ease-out, and from where it stands to the new value when
	 * the value changes.
	 *
	 * The old one tweened a JavaScript number. This one moves the decimal
	 * string itself through `lerpDecimal`, so a balance is never a float on
	 * its way to the screen (D12), and the last frame prints the exact value.
	 *
	 * Three cases do not count (D108): a figure the server rendered, which is
	 * already right when hydration takes it over; a reader who asked for less
	 * motion (D64); and a value that did not change.
	 *
	 * The moving text is hidden from assistive technology and the final
	 * figure is read instead, once, rather than a number per frame.
	 */
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';

	import { hydrated } from '$lib/hydration';
	import { lerpDecimal } from '$lib/money';

	let {
		value,
		format,
		duration = 800
	}: {
		/** A decimal string. */
		value: string;
		format: (value: string) => string;
		/** Milliseconds, the old app's 0.8s. */
		duration?: number;
	} = $props();

	// Read once, at setup: was this figure in the markup the server sent?
	const fromZero = hydrated() && !prefersReducedMotion.current;
	let shown = $state(untrack(() => (fromZero ? '0' : value)));

	$effect(() => {
		const target = value;
		const from = untrack(() => shown);
		if (from === target) return;
		if (prefersReducedMotion.current) {
			shown = target;
			return;
		}

		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			// Cubic ease-out, close to framer-motion's `easeOut`.
			shown = lerpDecimal(from, target, 1 - (1 - t) ** 3);
			if (t < 1) frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	});
</script>

<span aria-hidden="true">{format(shown)}</span><span class="sr-only">{format(value)}</span>
