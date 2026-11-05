<script lang="ts">
	/**
	 * The conversation list (CHAT-1), as the old app's history dropdown.
	 *
	 * Rows of 32px: the title, how long ago, and on hover the actions. The
	 * composer owns the panel around it and opens it from its history button.
	 * Two differences from the old list: delete works and asks first (UI-4),
	 * and rename is kept, because it shipped with the session list. The old
	 * search box is gone: it never filtered anything.
	 *
	 * It holds no data and fetches nothing: rows come in as props and every
	 * action is a callback, so the page decides what rename and delete mean.
	 */
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { t } from '$lib/i18n';
	import type { SessionItem } from '$lib/chat';
	import { cn } from '$lib/utils.js';

	import { Button } from '../../atoms/button/index.js';
	import * as Dialog from '../../atoms/dialog/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { ConfirmDialog } from '../../molecules/confirm-dialog/index.js';

	let {
		sessions,
		activeId = null,
		basePath = '/chat',
		onOpen,
		onRename,
		onDelete
	}: {
		sessions: SessionItem[];
		activeId?: string | null;
		basePath?: string;
		/** A row was followed, so the panel around it can close. */
		onOpen?: () => void;
		onRename: (id: string, title: string) => void;
		onDelete: (id: string) => void;
	} = $props();

	/*
	 * The session an action is aimed at. Each dialog's open flag is its own
	 * state and is bound: a dialog closes itself, and a one-way flag would
	 * leave this side believing it is still open.
	 */
	let target = $state<SessionItem | null>(null);
	let renameOpen = $state(false);
	let deleteOpen = $state(false);
	let draftTitle = $state('');

	function startRename(session: SessionItem) {
		target = session;
		draftTitle = session.title;
		renameOpen = true;
	}

	function startDelete(session: SessionItem) {
		target = session;
		deleteOpen = true;
	}

	function commitRename() {
		const title = draftTitle.trim();
		if (!target || !title) return;
		onRename(target.id, title);
		renameOpen = false;
	}
</script>

{#if sessions.length === 0}
	<p class="text-muted-foreground flex items-center justify-center py-8 text-sm">
		{t('chat.history_empty')}
	</p>
{:else}
	<ul class="flex flex-col gap-1">
		{#each sessions as session (session.id)}
			<li
				class={cn(
					'group relative flex h-8 items-center justify-between px-2 text-sm transition-colors',
					session.id === activeId ? 'bg-black/5 dark:bg-white/5' : 'hover:bg-black/5 dark:hover:bg-white/5'
				)}
			>
				<a
					href="{basePath}/{session.id}"
					class="min-w-0 flex-1"
					aria-current={session.id === activeId ? 'page' : undefined}
					onclick={() => onOpen?.()}
				>
					<span class="ml-2 line-clamp-1 text-[#666] dark:text-[#999]">{session.title}</span>
				</a>
				<span class="ml-2 flex shrink-0 items-center gap-1">
					<span class="text-xs whitespace-nowrap text-[#666] dark:text-[#999]">{session.when}</span>
					<button
						type="button"
						class="hover:bg-black/5 dark:hover:bg-white/5 pointer-events-none w-0 overflow-hidden p-1 opacity-0 transition-all duration-200 group-focus-within:pointer-events-auto group-focus-within:w-6 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:w-6 group-hover:opacity-100"
						aria-label={`${t('chat.rename')}: ${session.title}`}
						onclick={() => startRename(session)}
					>
						<PencilLine class="text-muted-foreground size-3.5" />
					</button>
					<button
						type="button"
						class="hover:bg-destructive/10 pointer-events-none w-0 overflow-hidden p-1 opacity-0 transition-all duration-200 group-focus-within:pointer-events-auto group-focus-within:w-6 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:w-6 group-hover:opacity-100"
						aria-label={`${t('common.delete')}: ${session.title}`}
						onclick={() => startDelete(session)}
					>
						<Trash2 class="text-muted-foreground hover:text-destructive size-3.5" />
					</button>
				</span>
			</li>
		{/each}
	</ul>
{/if}

<Dialog.Root bind:open={renameOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{t('chat.rename_title')}</Dialog.Title>
		</Dialog.Header>
		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				commitRename();
			}}
		>
			<label class="text-body flex flex-col gap-2">
				{t('chat.rename_label')}
				<!-- svelte-ignore a11y_autofocus -- the dialog exists to type in -->
				<Input bind:value={draftTitle} autofocus maxlength={120} />
			</label>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (renameOpen = false)}>
					{t('common.cancel')}
				</Button>
				<Button type="submit" disabled={draftTitle.trim() === ''}>{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={deleteOpen}
	title={t('chat.delete_title')}
	description={t('chat.delete_body')}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => {
		if (target) onDelete(target.id);
	}}
/>
