<script lang="ts">
	/**
	 * The conversation list (CHAT-1).
	 *
	 * Ported from the old app's `chat-history.tsx`, which was a dropdown
	 * with its own search, debounce and keyboard handling. Here it is a
	 * column beside the conversation, because the session list is where a
	 * chat is navigated from, not a menu hidden behind an icon.
	 *
	 * It holds no data and fetches nothing: rows come in as props and every
	 * action is a callback, so the page that mounts it decides what rename
	 * and delete mean.
	 */
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { t } from '$lib/i18n';
	import type { SessionItem } from '$lib/chat';

	import { Button } from '../../atoms/button/index.js';
	import * as Dialog from '../../atoms/dialog/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { ScrollArea } from '../../atoms/scroll-area/index.js';
	import { ConfirmDialog } from '../../molecules/confirm-dialog/index.js';

	let {
		sessions,
		activeId = null,
		basePath = '/chat',
		onNew,
		onRename,
		onDelete
	}: {
		sessions: SessionItem[];
		activeId?: string | null;
		basePath?: string;
		onNew: () => void;
		onRename: (id: string, title: string) => void;
		onDelete: (id: string) => void;
	} = $props();

	/*
	 * The session a menu action is aimed at, and what it is being called.
	 *
	 * Each dialog's open flag is its own state and is bound, not derived
	 * from the target: a dialog closes itself, and a one-way `open` would
	 * leave this side believing it is still open, so it never reopens.
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

<div class="flex h-full w-full flex-col gap-3">
	<div class="flex items-center justify-between gap-2 px-1">
		<h2 class="text-subtle text-caption uppercase">{t('chat.conversations')}</h2>
		<Button variant="ghost" size="icon" title={t('chat.new_chat_hint')} onclick={onNew}>
			<MessageSquarePlus />
			<span class="sr-only">{t('chat.new_chat')}</span>
		</Button>
	</div>

	{#if sessions.length === 0}
		<p class="text-subtle text-body px-1">{t('chat.no_conversations_body')}</p>
	{:else}
		<ScrollArea class="min-h-0 flex-1">
			<ul class="flex flex-col gap-1 pr-2">
				{#each sessions as session (session.id)}
					<li
						class="group flex items-center gap-1 border border-transparent px-2 py-2 transition-colors
							{session.id === activeId ? 'bg-muted border-border' : 'hover:bg-muted/60'}"
					>
						<a
							href="{basePath}/{session.id}"
							class="min-w-0 flex-1"
							aria-current={session.id === activeId ? 'page' : undefined}
						>
							<span class="text-body block truncate">{session.title}</span>
							<span class="text-subtle text-caption block truncate">
								{session.preview}
							</span>
						</a>

						<span class="text-subtle text-caption shrink-0">{session.when}</span>

						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="ghost"
										size="icon"
										class="size-7 shrink-0"
										title={t('common.actions')}
									>
										<MoreHorizontal />
										<span class="sr-only">{t('common.actions')}</span>
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-40">
								<DropdownMenu.Item onclick={() => startRename(session)}>
									<PencilLine />
									{t('chat.rename')}
								</DropdownMenu.Item>
								<DropdownMenu.Item variant="destructive" onclick={() => startDelete(session)}>
									<Trash2 />
									{t('common.delete')}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</li>
				{/each}
			</ul>
		</ScrollArea>
	{/if}
</div>

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
