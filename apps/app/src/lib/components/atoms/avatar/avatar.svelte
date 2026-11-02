<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/*
	 * Ported from the old app's atoms/avatar.tsx.
	 *
	 * Round, as the old one is.
	 */
	export const avatarVariants = tv({
		base: 'relative flex shrink-0 overflow-hidden rounded-full',
		variants: { size: { sm: 'size-6', default: 'size-10', lg: 'size-10' } },
		defaultVariants: { size: 'default' }
	});

	export type AvatarSize = VariantProps<typeof avatarVariants>['size'];
</script>

<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		...restProps
	}: AvatarPrimitive.RootProps & { size?: AvatarSize } = $props();
</script>

<AvatarPrimitive.Root
	bind:ref
	data-slot="avatar"
	data-size={size}
	class={cn(avatarVariants({ size }), className)}
	{...restProps}
/>
