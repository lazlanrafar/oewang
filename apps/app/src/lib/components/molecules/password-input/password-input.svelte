<script lang="ts">
	/*
	 * A password field with a show and hide toggle at its end, so a person
	 * can check what they typed before submitting. New here: the old app's
	 * auth forms had no toggle.
	 *
	 * Built on the input group, as the currency input is, so the border,
	 * focus and invalid states are the input group's own. Every attribute a
	 * caller passes (id, name, autocomplete, required, minlength, aria-*)
	 * goes to the input itself, so a `<label for>` and password managers
	 * find it as before. The toggle is `type="button"`, so pressing it never
	 * submits the form, and it stays in the Tab order for keyboard users.
	 */
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import type { ComponentProps } from 'svelte';

	import { Input } from '../../atoms/input/index.js';
	import * as InputGroup from '../input-group/index.js';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(),
		class: className,
		...props
	}: Omit<ComponentProps<typeof Input>, 'type' | 'files'> = $props();

	let visible = $state(false);
</script>

<InputGroup.Root class={cn(className)}>
	<InputGroup.Input type={visible ? 'text' : 'password'} bind:value {...props} />
	<InputGroup.Addon align="inline-end">
		<InputGroup.Button
			size="icon-xs"
			class="text-muted-foreground hover:text-foreground"
			aria-label={visible ? t('common.hide_password') : t('common.show_password')}
			disabled={props.disabled}
			onclick={() => (visible = !visible)}
		>
			{#if visible}<EyeOff />{:else}<Eye />{/if}
		</InputGroup.Button>
	</InputGroup.Addon>
</InputGroup.Root>
