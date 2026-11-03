<script lang="ts">
	/**
	 * Ask before something irreversible (UI-4).
	 *
	 * A dialog rather than the browser's `confirm`. The native one blocks
	 * the renderer until it is dismissed, which freezes the page and any
	 * automation driving it, and it cannot be styled or translated. This
	 * one is the design system's alert dialog, so it reads like the rest of
	 * the product.
	 */
	import { Button } from '../../atoms/button/index.js';
	import * as AlertDialog from '../../atoms/alert-dialog/index.js';

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		onConfirm
	}: {
		open?: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onConfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content class="sm:max-w-sm">
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description>{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>

		<AlertDialog.Footer>
			<AlertDialog.Cancel>
				{#snippet child({ props })}
					<Button {...props} variant="outline">{cancelLabel}</Button>
				{/snippet}
			</AlertDialog.Cancel>
			<AlertDialog.Action>
				{#snippet child({ props })}
					<!-- Our handler replaces the primitive's, and the primitive's is
					     what closed the dialog, so this closes it itself. Without
					     that the dialog stays open behind whatever the confirm
					     started. -->
					<Button
						{...props}
						variant="destructive"
						onclick={() => {
							open = false;
							onConfirm();
						}}
					>
						{confirmLabel}
					</Button>
				{/snippet}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
