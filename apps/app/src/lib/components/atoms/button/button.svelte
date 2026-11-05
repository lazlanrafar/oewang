<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	/*
	 * Ported from the old app's packages/ui/src/components/atoms/button.tsx.
	 *
	 * Square by design: the old button carries no `rounded-*` class, and the
	 * radius scale in app.css is zero, so nothing rounds it back.
	 *
	 * One deliberate difference. The old base string carried
	 * `focus-visible:outline-none`, which together with the old global
	 * `*:focus-visible { outline: none !important }` left keyboard users with
	 * no indication of where they were. It is dropped here so the global
	 * `:focus-visible` outline in app.css can show (UI-7). Pointer focus is
	 * still silent, which is what that rule was reaching for.
	 */
	export const buttonVariants = tv({
		base: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
				outline: 'border bg-transparent hover:bg-accent hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				// A ghost that removes, as the old app's row trash: red at rest, a red
				// tint on hover, never the filled destructive block in a table row.
				'ghost-destructive': 'text-destructive hover:bg-destructive/10 hover:text-destructive',
				// The old vault panel's Delete: an outline that turns red on hover.
				'outline-destructive':
					'border bg-transparent text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 px-3 text-xs',
				lg: 'h-10 px-8',
				icon: 'h-9 w-9',
				// The old app's small-caps action, as under a sheet's attachments.
				caps: 'h-9 gap-2 px-3 font-medium text-[10px] uppercase tracking-widest'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			/** Shows a spinner and blocks interaction, as the old atom did. */
			loading?: boolean;
		};
</script>

<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';

	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		loading = false,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		disabled={disabled || loading}
		{...restProps}
	>
		{#if loading}
			<LoaderCircle class="mr-2 size-4 animate-spin" aria-hidden="true" />
		{/if}
		{@render children?.()}
	</button>
{/if}
