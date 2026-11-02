<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';

	// The root renders nothing of its own, so it has no element to label.
	let { ...restProps }: TooltipPrimitive.RootProps = $props();
</script>

<TooltipPrimitive.Root {...restProps} />
