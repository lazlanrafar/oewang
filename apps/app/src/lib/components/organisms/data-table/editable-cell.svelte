<script lang="ts">
	/**
	 * A cell that expands into an editor.
	 *
	 * Clicking the cell turns it into an input that is wider than its column,
	 * drawn over the cells beside it, so a long description can be read and
	 * typed without the row growing or the column being resized. Enter and
	 * blur commit, Escape restores what was there before.
	 *
	 * The expansion is an overlay, not a layout change: the row keeps its
	 * 45px and the columns keep their widths, which is what stops the table
	 * from jumping while one cell is open.
	 *
	 * The value is a string in and a string out. An amount stays a decimal
	 * string the whole way through and is never parsed into a float (D12);
	 * validating it is the caller's job, which is where the currency is known.
	 */
	import { tick } from 'svelte';

	import { cn } from '$lib/utils.js';

	let {
		value,
		onCommit,
		onOpen,
		onClose,
		display,
		label,
		align = 'left',
		mono = false,
		/** How wide the editor opens, in pixels. Never narrower than the cell. */
		expandTo = 320,
		disabled = false,
		class: className
	}: {
		/** The value being edited, raw: a decimal string for an amount. */
		value: string;
		onCommit: (value: string) => void;
		/** Told when the editor opens, so the cell can stop clipping it. */
		onOpen?: () => void;
		onClose?: () => void;
		/** What to show while closed, when that differs from the raw value. */
		display?: string;
		/** Describes the cell for a screen reader, since the text alone may not. */
		label: string;
		align?: 'left' | 'right';
		mono?: boolean;
		expandTo?: number;
		disabled?: boolean;
		class?: string;
	} = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);

	async function start() {
		if (disabled) return;
		draft = value;
		editing = true;
		onOpen?.();
		await tick();
		input?.focus();
		input?.select();
	}

	function commit() {
		if (!editing) return;
		editing = false;
		if (draft === value) {
			onClose?.();
			return;
		}
		// `onCommit` is what closes the cell in the caller, since it is the
		// caller that knows whether the new value was accepted.
		onCommit(draft);
	}

	function cancel() {
		editing = false;
		draft = value;
		onClose?.();
	}
</script>

{#if editing}
	<!--
		The editor sits on top of the cell and overflows it to the right, so it
		needs the cell's own `overflow-hidden` lifted while it is open: the
		caller does that with `data-editing`.
	-->
	<div
		class="bg-background border-primary absolute inset-y-0 left-0 z-30 flex items-center border px-4"
		style="min-width: 100%; width: {expandTo}px"
	>
		<input
			bind:this={input}
			bind:value={draft}
			aria-label={label}
			class={cn(
				'text-body h-full w-full border-0 bg-transparent p-0 outline-none',
				mono && 'font-mono',
				align === 'right' && 'text-right',
				className
			)}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					commit();
				} else if (event.key === 'Escape') {
					event.preventDefault();
					cancel();
				}
			}}
			onblur={commit}
		/>
	</div>
{:else}
	<button
		type="button"
		{disabled}
		aria-label="{label}. Click to edit"
		class={cn(
			'h-full w-full truncate text-left',
			align === 'right' && 'text-right',
			mono && 'font-mono',
			disabled && 'cursor-default',
			className
		)}
		onclick={(event) => {
			// The row opens its detail on click; editing a cell is a different
			// intent, so it stops there.
			event.stopPropagation();
			start();
		}}
	>
		{display ?? value}
	</button>
{/if}
