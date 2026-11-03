<script lang="ts">
	/**
	 * Three questions to start with, on an empty conversation.
	 *
	 * Ported from the old app's `chat-suggestion-button.tsx`. The three are
	 * fixed rather than generated (docs/features/chat.md#screens): one read,
	 * one write and one summary, so the first turn shows what the assistant
	 * is for without a round trip to decide what to suggest.
	 */
	import { Button } from '../../atoms/button/index.js';
	import { t } from '$lib/i18n';

	let { onSelect, disabled = false }: { onSelect: (text: string) => void; disabled?: boolean } =
		$props();

	const suggestions = [
		t('chat.suggestion_food'),
		t('chat.suggestion_lunch'),
		t('chat.suggestion_biggest')
	];
</script>

<div class="flex flex-col items-center gap-2">
	<p class="text-subtle text-caption">{t('chat.suggestions_label')}</p>
	<ul class="flex flex-wrap justify-center gap-2">
		{#each suggestions as suggestion (suggestion)}
			<li>
				<Button variant="outline" size="sm" {disabled} onclick={() => onSelect(suggestion)}>
					{suggestion}
				</Button>
			</li>
		{/each}
	</ul>
</div>
