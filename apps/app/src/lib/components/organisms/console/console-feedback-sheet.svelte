<script lang="ts">
	/**
	 * One piece of feedback (CSL-8, US-083): the message in full, who sent
	 * it and from which workspace, each linking to that sheet. An operator
	 * with `console.feedback.write` can mark it done or reopen it and keep an
	 * internal note; both post to the page's `?/update`, which owns them.
	 */
	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { formatDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleFeedback } from '$lib/server/console';

	import { FEEDBACK_STATUS_LABEL, FEEDBACK_TYPE_LABEL } from './console-feedback-labels';

	let {
		open = false,
		onOpenChange,
		item,
		canWrite = false,
		saving = null,
		fieldErrors,
		enhanceUpdate
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		item: ConsoleFeedback | null;
		/** The operator holds `console.feedback.write`; the API checks it again. */
		canWrite?: boolean;
		/** Which of the two forms is on its way. */
		saving?: 'status' | 'note' | null;
		fieldErrors?: Record<string, string>;
		/** Both forms' save, owned by the page. */
		enhanceUpdate?: (node: HTMLFormElement) => void;
	} = $props();

	/** The API's limit on a note. */
	const NOTE_MAX = 2000;

	const progressive = (node: HTMLFormElement) => enhanceUpdate?.(node);
	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root {open} {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		{#if item}
			<Sheet.Header
				class="bg-muted/5 flex shrink-0 flex-row items-center justify-between gap-4 space-y-0 border-b p-6 text-left"
			>
				<div class="min-w-0 space-y-1">
					<Sheet.Title class="font-serif text-xl font-normal">{FEEDBACK_TYPE_LABEL[item.type]}</Sheet.Title>
					<Sheet.Description class="text-muted-foreground text-xs tracking-widest uppercase tabular-nums">
						{formatDay(item.created_at)}
					</Sheet.Description>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<Badge variant={item.status === 'open' ? 'secondary' : 'muted'}>{FEEDBACK_STATUS_LABEL[item.status]}</Badge>
					{#if canWrite}
						<form method="POST" action="?/update" use:progressive>
							<input type="hidden" name="id" value={item.id} />
							<input type="hidden" name="status" value={item.status === 'open' ? 'done' : 'open'} />
							<Button
								type="submit"
								variant="outline"
								size="caps"
								loading={saving === 'status'}
								disabled={saving !== null}
							>
								{item.status === 'open' ? t('console.feedback.sheet.mark_done') : t('console.feedback.sheet.reopen')}
							</Button>
						</form>
					{/if}
				</div>
			</Sheet.Header>

			<div class="no-scrollbar flex-1 overflow-y-auto">
				<section class="border-border/50 space-y-2 border-b p-6">
					<h3 class={capsLabel}>{t('console.feedback.sheet.message')}</h3>
					<p class="text-sm leading-relaxed break-words whitespace-pre-wrap">{item.message}</p>
				</section>

				<dl class="border-border/50 bg-muted/5 grid grid-cols-2 gap-6 border-b p-6">
					<div class="min-w-0 space-y-1">
						<dt class={capsLabel}>{t('console.feedback.sheet.from')}</dt>
						<dd class="truncate text-sm">
							<a class="hover:underline" href="/console/users?user={encodeURIComponent(item.user_id)}">
								{item.user_email}
							</a>
						</dd>
					</div>
					<div class="min-w-0 space-y-1">
						<dt class={capsLabel}>{t('console.feedback.sheet.workspace')}</dt>
						<dd class="truncate text-sm">
							<a
								class="hover:underline"
								href="/console/workspaces?workspace={encodeURIComponent(item.workspace_id)}"
							>
								{item.workspace_name}
							</a>
						</dd>
					</div>
					<div class="space-y-1">
						<dt class={capsLabel}>{t('console.feedback.sheet.received')}</dt>
						<dd class="text-sm tabular-nums">{formatDay(item.created_at)}</dd>
					</div>
					{#if item.resolved_at}
						<div class="space-y-1">
							<dt class={capsLabel}>{t('console.feedback.sheet.resolved')}</dt>
							<dd class="text-sm tabular-nums">{formatDay(item.resolved_at)}</dd>
						</div>
					{/if}
				</dl>

				<section class="space-y-2 p-6">
					{#if canWrite}
						<!-- Keyed so another item's sheet starts from its own note, not this draft. -->
						{#key item.id}
							<form method="POST" action="?/update" use:progressive class="space-y-2">
								<input type="hidden" name="id" value={item.id} />
								<Label for="feedback-note" class={capsLabel}>{t('console.feedback.sheet.note_label')}</Label>
								<Textarea
									id="feedback-note"
									name="operator_note"
									rows={4}
									maxlength={NOTE_MAX}
									value={item.operator_note ?? ''}
									placeholder={t('console.feedback.sheet.note_placeholder')}
									aria-invalid={fieldErrors?.operator_note ? 'true' : undefined}
								/>
								<p class="text-subtle text-xs">{t('console.feedback.sheet.note_help')}</p>
								<FieldError message={fieldErrors?.operator_note} />
								<Button type="submit" variant="outline" loading={saving === 'note'} disabled={saving !== null}>
									{t('console.feedback.sheet.save_note')}
								</Button>
							</form>
						{/key}
					{:else}
						<h3 class={capsLabel}>{t('console.feedback.sheet.note_label')}</h3>
						<p class="text-muted-foreground text-sm whitespace-pre-wrap">
							{item.operator_note ?? t('console.feedback.sheet.no_note')}
						</p>
					{/if}
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
