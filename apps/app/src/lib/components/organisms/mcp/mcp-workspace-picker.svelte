<script lang="ts">
	/**
	 * How far an MCP token or connection reaches (D106): every workspace,
	 * including ones joined later, or a picked set. Posts `scope` and one
	 * `workspace_ids` per picked workspace, so the form that holds it reads
	 * the choice the same way wherever it is used.
	 */
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Label } from '$lib/components/atoms/label';
	import * as RadioGroup from '$lib/components/atoms/radio-group';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { t } from '$lib/i18n';

	let {
		workspaces,
		scope = $bindable<'all' | 'some'>('all'),
		picked = $bindable<string[]>([]),
		error,
		idPrefix = 'mcp'
	}: {
		workspaces: { id: string; name: string }[];
		scope?: 'all' | 'some';
		picked?: string[];
		error?: string;
		/** Keeps ids unique when two pickers share a page. */
		idPrefix?: string;
	} = $props();

	function toggle(id: string, on: boolean) {
		picked = on ? [...picked, id] : picked.filter((value) => value !== id);
	}
</script>

<div class="grid gap-3">
	<RadioGroup.Root bind:value={scope} name="scope" class="grid gap-2">
		<div class="flex items-center gap-2">
			<RadioGroup.Item value="all" id="{idPrefix}-scope-all" />
			<Label for="{idPrefix}-scope-all" class="text-sm font-normal">
				{t('account.mcp.workspaces_all')}
			</Label>
		</div>
		<div class="flex items-center gap-2">
			<RadioGroup.Item value="some" id="{idPrefix}-scope-some" />
			<Label for="{idPrefix}-scope-some" class="text-sm font-normal">
				{t('account.mcp.workspaces_some')}
			</Label>
		</div>
	</RadioGroup.Root>
	{#if scope === 'some'}
		<div class="grid gap-2 pl-6">
			{#each workspaces as workspace (workspace.id)}
				<div class="flex items-center gap-2">
					<Checkbox
						id="{idPrefix}-ws-{workspace.id}"
						checked={picked.includes(workspace.id)}
						onCheckedChange={(on) => toggle(workspace.id, on === true)}
					/>
					<Label for="{idPrefix}-ws-{workspace.id}" class="text-sm font-normal">
						{workspace.name}
					</Label>
				</div>
			{/each}
			{#each picked as id (id)}
				<input type="hidden" name="workspace_ids" value={id} />
			{/each}
		</div>
	{/if}
	<FieldError message={error} />
</div>
