<script lang="ts">
	/**
	 * The composer (UI-2).
	 *
	 * Ported from the old app's `chat-input.tsx`, minus the command menu, web
	 * search and quota card, which are not being built at all
	 * (docs/features/chat.md#ui-port-map).
	 *
	 * It holds the draft and the files chosen for the turn, and nothing
	 * else. Sending and stopping are callbacks, so the page owns the turn
	 * and this stays a control.
	 *
	 * The attachment button opens the same dropzone the transaction form
	 * uses, so a receipt photographed into the chat takes the one upload
	 * path there is: split in the browser, chunk by chunk through this
	 * app's own server, never a signed storage URL (D23).
	 */
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Square from '@lucide/svelte/icons/square';

	import { composerHeight } from '$lib/chat-stream';
	import { t } from '$lib/i18n';

	import { Button } from '../../atoms/button/index.js';
	import { Textarea } from '../../atoms/textarea/index.js';
	import { FileDropzone, type UploadedFile } from '../../molecules/file-dropzone/index.js';

	let {
		value = $bindable(''),
		files = $bindable([]),
		streaming = false,
		disabled = false,
		placeholder = t('chat.input_placeholder'),
		onSend,
		onStop
	}: {
		value?: string;
		/** The files this turn carries, uploaded and waiting for a message. */
		files?: UploadedFile[];
		/** A turn is running: the send button becomes the stop button. */
		streaming?: boolean;
		disabled?: boolean;
		placeholder?: string;
		onSend: (message: string) => void;
		onStop: () => void;
	} = $props();

	let field = $state<HTMLTextAreaElement | null>(null);
	let overflowing = $state(false);
	let attaching = $state(false);

	/*
	 * The panel stays open while anything is attached. Closing it over a
	 * file that is about to be sent would hide what the turn carries.
	 */
	const showDropzone = $derived(attaching || files.length > 0);

	/*
	 * The field grows with its content, then scrolls.
	 *
	 * A genuine side effect: the height of wrapped text is not known until
	 * the browser has laid it out, so the measurement has to happen after
	 * the value reaches the DOM. The rule itself is in `composerHeight`,
	 * where it is tested without a browser.
	 */
	$effect(() => {
		// Read the draft so this runs on every keystroke, including the
		// clear that follows a send.
		const draft = value;
		const element = field;
		if (!element) return;

		// Collapse first, or `scrollHeight` reports the height it already has
		// and the field never shrinks back after a deletion.
		element.style.height = 'auto';
		const size = composerHeight(element.scrollHeight);
		element.style.height = `${size.height}px`;
		overflowing = size.scroll && draft !== '';
	});

	function submit() {
		if (streaming || disabled) return;

		const message = value.trim();
		if (!message) return;

		attaching = false;
		onSend(message);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;

		// An IME uses Enter to accept the candidate it is showing. Sending
		// here would cut the word in half.
		if (event.isComposing) return;

		event.preventDefault();
		submit();
	}
</script>

<form
	class="flex flex-col gap-2"
	onsubmit={(event) => {
		event.preventDefault();
		submit();
	}}
>
	{#if showDropzone}
		<FileDropzone bind:files disabled={disabled || streaming} />
	{/if}

	<div class="flex items-end gap-2">
		<Button
			type="button"
			variant="ghost"
			size="icon"
			title={attaching ? t('chat.attach_close') : t('chat.attach')}
			aria-expanded={showDropzone}
			disabled={disabled || streaming}
			onclick={() => (attaching = !attaching)}
		>
			<Paperclip />
			<span class="sr-only">{attaching ? t('chat.attach_close') : t('chat.attach')}</span>
		</Button>

		<Textarea
			bind:ref={field}
			bind:value
			{placeholder}
			{disabled}
			rows={1}
			aria-label={t('chat.input_label')}
			onkeydown={keydown}
			class="field-sizing-fixed min-h-0 resize-none {overflowing
				? 'overflow-y-auto'
				: 'overflow-y-hidden'}"
		/>

		{#if streaming}
			<Button type="button" variant="outline" size="icon" title={t('chat.stop')} onclick={onStop}>
				<Square />
				<span class="sr-only">{t('chat.stop')}</span>
			</Button>
		{:else}
			<Button
				type="submit"
				size="icon"
				title={t('chat.send')}
				disabled={disabled || value.trim() === ''}
			>
				<ArrowUp />
				<span class="sr-only">{t('chat.send')}</span>
			</Button>
		{/if}
	</div>

	<p class="text-subtle text-caption">{t('chat.input_hint')}</p>
</form>
