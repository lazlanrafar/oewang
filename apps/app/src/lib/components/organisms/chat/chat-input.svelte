<script lang="ts">
	/**
	 * The composer (UI-2), as the old app's `chat-input.tsx` (D87).
	 *
	 * The same surface, sizes and behaviour: a square translucent box, a
	 * one-line field over a toolbar of add, shortcuts and history, the send
	 * button on the right that becomes stop while a turn runs and a cross
	 * after a failure. Files are picked or dropped anywhere on the page and
	 * shown as thumbnails above the field. Typing "/" opens the shortcuts.
	 * As the page scrolls it narrows and folds to the field alone, unless
	 * it is being used.
	 *
	 * Left out on purpose: the web search toggle, which is not in v1 (PRD
	 * non-goals), and the AI quota card, which went with billing.
	 *
	 * What changed underneath: a file is uploaded to the vault as soon as it
	 * is picked, through the one upload path there is (D23), rather than sent
	 * inline as base64. The thumbnail shows it in flight.
	 *
	 * It holds the draft, the files and its own menus, and nothing else.
	 * Sending and stopping are callbacks, so the page owns the turn. The
	 * history list is a snippet for the same reason.
	 */
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import History from '@lucide/svelte/icons/history';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Plus from '@lucide/svelte/icons/plus';
	import Square from '@lucide/svelte/icons/square';
	import X from '@lucide/svelte/icons/x';
	import Zap from '@lucide/svelte/icons/zap';
	import type { Snippet } from 'svelte';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { commandQuery, filterCommands, CHAT_COMMANDS, type ChatCommand } from '$lib/chat-commands';
	import { ACCEPTED_FILE_TYPES, uploadErrorMessage, uploadFile } from '$lib/files';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils.js';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { Textarea } from '../../atoms/textarea/index.js';
	import type { UploadedFile } from '../../molecules/file-dropzone/index.js';

	let {
		value = $bindable(''),
		files = $bindable([]),
		streaming = false,
		failed = false,
		disabled = false,
		placeholder = t('chat.input_placeholder'),
		compact = 0,
		history,
		onSend,
		onStop
	}: {
		value?: string;
		/** The files this turn carries, already in the vault (VLT-1). */
		files?: UploadedFile[];
		/** A turn is running: the send button becomes the stop button. */
		streaming?: boolean;
		/** The last turn failed: the send button shows a cross, as the old one did. */
		failed?: boolean;
		disabled?: boolean;
		placeholder?: string;
		/** How far the page has scrolled past the composer, 0 to 1. */
		compact?: number;
		/** The conversation list, opened from the history button. */
		history?: Snippet<[{ close: () => void }]>;
		onSend: (message: string) => void;
		onStop: () => void;
	} = $props();

	let root = $state<HTMLDivElement | null>(null);
	let field = $state<HTMLTextAreaElement | null>(null);
	let fieldBox = $state<HTMLDivElement | null>(null);
	let picker = $state<HTMLInputElement | null>(null);

	let focused = $state(false);
	let interacting = $state(false);
	let commandsOpen = $state(false);
	let historyOpen = $state(false);
	let commands = $state<ChatCommand[]>(CHAT_COMMANDS);
	let selected = $state(0);

	/** Uploads in flight, shown as thumbnails with a spinner. */
	let pending = $state<{ key: string; name: string; preview: string | null }[]>([]);
	/** Image previews of what is attached, by vault id. */
	let previews = $state<Record<string, string>>({});

	// ------------------------------------------------------------ folding

	/** In use: never folded, whatever the scroll says (the old rule). */
	const engaged = $derived(
		focused || commandsOpen || historyOpen || interacting || value.trim() !== ''
	);
	const factor = $derived(engaged ? 0 : Math.min(1, Math.max(0, compact)));
	const row = $derived(factor > 0.15);
	const fade = $derived(factor >= 0.4 ? 0 : 1 - factor / 0.4);

	// ------------------------------------------------------------ text reveal

	/*
	 * Text that arrives from outside, rather than from typing, wipes in from
	 * the left, as the old composer did. A genuine side effect: the
	 * animation is the DOM's.
	 */
	let typing = false;
	let previous = '';

	$effect(() => {
		const current = value;
		const external = current !== previous && !typing && current !== '';
		previous = current;
		typing = false;

		if (external && fieldBox) {
			fieldBox.animate(
				[
					{ clipPath: 'inset(0 100% 0 0)', opacity: 0 },
					{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }
				],
				{ duration: 700, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' }
			);
		}
	});

	// ------------------------------------------------------------ sending

	const uploading = $derived(pending.length > 0);
	const canSend = $derived(
		!disabled && !uploading && (value.trim() !== '' || files.length > 0)
	);

	function submit() {
		if (streaming || !canSend) return;

		const message = value.trim() || t('chat.attachment_fallback');
		closeMenus();
		onSend(message);
	}

	function runCommand(command: ChatCommand) {
		closeMenus();
		value = '';
		onSend(t(command.title));
	}

	// ------------------------------------------------------------ menus

	function closeMenus() {
		commandsOpen = false;
		historyOpen = false;
		selected = 0;
	}

	function toggleCommands() {
		const opening = !commandsOpen;
		closeMenus();
		if (opening) {
			commands = CHAT_COMMANDS;
			commandsOpen = true;
			requestAnimationFrame(() => field?.focus());
		}
	}

	function toggleHistory() {
		const opening = !historyOpen;
		closeMenus();
		historyOpen = opening;
	}

	function input(event: Event) {
		typing = true;
		const element = event.currentTarget as HTMLTextAreaElement;
		const query = commandQuery(element.value, element.selectionStart ?? element.value.length);

		if (query === null) {
			commandsOpen = false;
			return;
		}

		historyOpen = false;
		commands = filterCommands(query);
		commandsOpen = true;
		selected = 0;
	}

	function keydown(event: KeyboardEvent) {
		if (commandsOpen && commands.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				selected = Math.min(selected + 1, commands.length - 1);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				selected = Math.max(selected - 1, 0);
				return;
			}
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				const command = commands[selected];
				if (command) runCommand(command);
				return;
			}
		}

		if (event.key === 'Escape' && (commandsOpen || historyOpen)) {
			event.preventDefault();
			closeMenus();
			return;
		}

		if (event.key !== 'Enter' || event.shiftKey) return;

		// An IME uses Enter to accept the candidate it is showing.
		if (event.isComposing) return;

		event.preventDefault();
		submit();
	}

	/* A press outside the composer and its menus closes them. */
	function outside(event: PointerEvent) {
		if (!commandsOpen && !historyOpen) return;
		const target = event.target as Node | null;
		if (root && target && root.contains(target)) return;
		// Dialogs the history list opens live in a portal, outside the root.
		if ((target as Element | null)?.closest?.('[role="dialog"], [role="alertdialog"]')) return;
		closeMenus();
	}

	/* The selected shortcut stays in view as the arrows move it. */
	$effect(() => {
		if (!commandsOpen) return;
		root?.querySelector(`[data-command-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	// ------------------------------------------------------------ files

	async function add(list: FileList | File[]) {
		if (disabled || streaming) return;

		for (const file of Array.from(list)) {
			if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
				toast.error(t('files.error_rejected_type'));
				continue;
			}

			const key = crypto.randomUUID();
			const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
			pending = [...pending, { key, name: file.name, preview }];

			try {
				const stored = await uploadFile(file, () => {});
				if (preview) previews = { ...previews, [stored.id]: preview };
				files = [...files, stored];
			} catch (error) {
				if (preview) URL.revokeObjectURL(preview);
				toast.error(uploadErrorMessage(error));
			} finally {
				pending = pending.filter((entry) => entry.key !== key);
			}
		}
	}

	function remove(id: string) {
		files = files.filter((file) => file.id !== id);
		const preview = previews[id];
		if (preview) {
			URL.revokeObjectURL(preview);
			const { [id]: _gone, ...rest } = previews;
			previews = rest;
		}
	}

	/* Files dropped anywhere on the page land here, as the old `globalDrop`. */
	function dragover(event: DragEvent) {
		if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
	}

	function drop(event: DragEvent) {
		// A drop zone of its own (a form, the receipt panel) has already
		// taken the drop by the time it bubbles to the window.
		if (event.defaultPrevented || !event.dataTransfer?.files.length) return;
		event.preventDefault();
		void add(event.dataTransfer.files);
	}

	onDestroy(() => {
		for (const url of Object.values(previews)) URL.revokeObjectURL(url);
	});
</script>

<svelte:window onpointerdown={outside} ondragover={dragover} ondrop={drop} />

<div
	bind:this={root}
	class="relative mx-auto w-full"
	style:max-width="{770 - factor * 370}px"
	data-slot="chat-input"
>
	{#if commandsOpen && commands.length > 0}
		<div class="absolute right-0 bottom-full left-0 z-30 mb-2 w-full">
			<div
				class="max-h-80 overflow-y-auto bg-[#f7f7f7]/85 p-2 backdrop-blur-lg dark:bg-[#171717]/85"
				role="listbox"
				aria-label={t('chat.commands_label')}
			>
				{#each commands as command, index (command.title)}
					<button
						type="button"
						role="option"
						aria-selected={index === selected}
						data-command-index={index}
						class={cn(
							'group flex w-full items-center justify-between px-2 py-2 text-left text-sm transition-colors',
							index === selected
								? 'bg-black/5 dark:bg-white/5'
								: 'hover:bg-black/5 dark:hover:bg-white/5'
						)}
						onmousedown={(event) => event.preventDefault()}
						onmouseenter={() => (selected = index)}
						onclick={() => runCommand(command)}
					>
						<span class="ml-2 text-[#666] dark:text-[#999]">{t(command.title)}</span>
						{#if index === selected}
							<ArrowRight
								class="size-4 text-gray-600 opacity-50 group-hover:text-black group-hover:opacity-100 dark:text-gray-400 dark:group-hover:text-white"
							/>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if historyOpen && history}
		<div class="absolute right-0 bottom-full left-0 z-30 mb-2 w-full">
			<div class="flex max-h-80 flex-col overflow-y-auto overscroll-contain bg-[#f7f7f7]/85 p-2 backdrop-blur-lg dark:bg-[#171717]/85">
				{@render history({ close: () => (historyOpen = false) })}
			</div>
		</div>
	{/if}

	{#if factor > 0.1}
		<!-- Folded, the whole surface focuses the field, as the old one did. -->
		<button
			type="button"
			class="absolute inset-0 z-10 cursor-text"
			aria-label={t('chat.composer_focus')}
			onclick={() => field?.focus()}
		></button>
	{/if}

	<div
		class={cn(
			'border-border/50 relative flex overflow-hidden border bg-[rgba(247,247,247,var(--composer-light))] backdrop-blur-lg transition-all dark:bg-[rgba(19,19,19,var(--composer-dark))]',
			focused && 'border-black/20 dark:border-white/20'
		)}
		style:--composer-light={0.85 - factor * 0.45}
		style:--composer-dark={0.7 - factor * 0.4}
		style:flex-direction={row ? 'row' : 'column'}
	>
		<input
			bind:this={picker}
			type="file"
			class="hidden"
			multiple
			accept="application/pdf,image/*"
			onchange={(event) => {
				const target = event.currentTarget;
				if (target.files) void add(target.files);
				target.value = '';
			}}
		/>

		<form
			class="w-full"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div
				class="flex w-full"
				style:gap="{12 - factor * 12}px"
				style:padding-right="{factor * 8}px"
				style:flex-direction={row ? 'row' : 'column'}
			>
				<div class={cn('flex flex-col', row && 'flex-1 flex-row pr-2')}>
					{#if files.length > 0 || pending.length > 0}
						<ul class="flex flex-wrap gap-2 p-3 pt-3" aria-live="polite" aria-label={t('chat.attachments')}>
							{#each files as file (file.id)}
								<li class="group relative size-14 border">
									{#if previews[file.id]}
										<img src={previews[file.id]} alt={file.name} class="size-full object-cover" />
									{:else}
										<span class="text-muted-foreground flex size-full items-center justify-center" title={file.name}>
											<Paperclip class="size-4" />
										</span>
									{/if}
									<Button
										type="button"
										variant="outline"
										size="icon"
										class="absolute -top-1.5 -right-1.5 size-6 rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
										aria-label={t('chat.attachment_remove', { name: file.name })}
										onclick={() => remove(file.id)}
									>
										<X class="size-3" />
									</Button>
								</li>
							{/each}
							{#each pending as entry (entry.key)}
								<li class="relative size-14 border" title={entry.name}>
									{#if entry.preview}
										<img src={entry.preview} alt={entry.name} class="size-full object-cover opacity-40" />
									{/if}
									<span class="absolute inset-0 flex items-center justify-center">
										<Spinner class="size-4" />
									</span>
								</li>
							{/each}
						</ul>
					{/if}

					<div
						bind:this={fieldBox}
						class="overflow-hidden"
						style:height="{55 - factor * 3}px"
						style:padding-bottom="{4 + factor * 6}px"
					>
						<Textarea
							bind:ref={field}
							bind:value
							variant="prompt"
							{placeholder}
							{disabled}
							rows={1}
							aria-label={t('chat.input_label')}
							aria-describedby="composer-hint"
							oninput={input}
							onkeydown={keydown}
							onfocus={() => (focused = true)}
							onblur={() => (focused = false)}
							class={cn(factor > 0.4 && value === '' && 'text-center placeholder:text-center')}
						/>
					</div>
				</div>
			</div>

			<p id="composer-hint" class="sr-only">{t('chat.input_hint')}</p>

			<div
				class="overflow-hidden"
				style:max-height="{56 * (1 - factor)}px"
				style:opacity={fade}
				inert={factor > 0.1}
			>
				<!-- Pressing a tool keeps the composer open while the press lands. -->
				<div
					class="flex items-center justify-between px-3 pb-2"
					role="toolbar"
					tabindex="-1"
					onpointerdown={() => (interacting = true)}
					onpointerup={() => setTimeout(() => (interacting = false), 100)}
					onfocusin={() => (interacting = true)}
					onfocusout={() => setTimeout(() => (interacting = false), 100)}
				>
					<div class="flex items-center gap-3.5" style:transform="scale({1 - factor * 0.05})">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							class="text-muted-foreground size-6"
							title={t('chat.attach_add')}
							disabled={disabled || streaming}
							onclick={() => picker?.click()}
						>
							<Plus class="size-4" />
							<span class="sr-only">{t('chat.attach_add')}</span>
						</Button>

						<button
							type="button"
							class="flex h-6 items-center"
							title={t('chat.commands_toggle')}
							aria-expanded={commandsOpen}
							onclick={(event) => {
								event.stopPropagation();
								toggleCommands();
							}}
						>
							<Zap
								class={cn(
									'size-4 transition-colors',
									commandsOpen
										? 'text-black dark:text-white'
										: 'text-[#707070] hover:text-[#999999] dark:text-[#666666] dark:hover:text-[#999999]'
								)}
							/>
							<span class="sr-only">{t('chat.commands_toggle')}</span>
						</button>

						{#if history}
							<button
								type="button"
								title={t('chat.history')}
								aria-expanded={historyOpen}
								class={cn(
									'flex h-6 items-center transition-colors duration-200',
									historyOpen
										? 'rounded-full bg-black/5 hover:bg-black/8 dark:bg-white/5 dark:hover:bg-white/8'
										: 'hover:bg-black/5 dark:hover:bg-white/5'
								)}
								onclick={toggleHistory}
							>
								<span class="flex size-6 items-center justify-center">
									<History
										class={cn(
											'size-4 transition-colors',
											historyOpen
												? 'text-black dark:text-white'
												: 'text-[#707070] hover:text-[#999999] dark:text-[#666666] dark:hover:text-[#999999]'
										)}
									/>
								</span>
								<span class="sr-only">{t('chat.history')}</span>
							</button>
						{/if}
					</div>

					<div style:transform="scale({1 - factor * 0.05})">
						{#if streaming}
							<Button type="button" size="icon" class="size-8" title={t('chat.stop')} onclick={onStop}>
								<Square class="size-4" />
								<span class="sr-only">{t('chat.stop')}</span>
							</Button>
						{:else}
							<Button type="submit" size="icon" class="size-8" title={t('chat.send')} disabled={!canSend}>
								{#if failed}
									<X class="size-4" />
								{:else}
									<ArrowUp class="size-4" />
								{/if}
								<span class="sr-only">{t('chat.send')}</span>
							</Button>
						{/if}
					</div>
				</div>
			</div>
		</form>
	</div>
</div>
