<script lang="ts">
	/**
	 * One plan (PLN-1, OEW-131): create it, edit it, or read it. The two
	 * limits are numbers where empty means unlimited, storage typed in MB;
	 * the features are a checkbox list of the fixed set. The system plan is
	 * read only, as the system console role is. The form posts to the page's
	 * `?/create` or `?/update`.
	 */
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { MB, PLAN_FEATURES } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsolePlan } from '$lib/server/console';

	let {
		open = $bindable(false),
		plan,
		mode,
		saving = false,
		fieldErrors,
		enhance
	}: {
		open?: boolean;
		/** Null when creating. */
		plan: ConsolePlan | null;
		mode: 'create' | 'edit' | 'view';
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The save, owned by the page. */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const readOnly = $derived(mode === 'view');
	const title = $derived(
		mode === 'create'
			? t('console.plans.form.create_title')
			: mode === 'edit'
				? t('console.plans.form.edit_title')
				: t('console.plans.form.view_title')
	);
	/** A new plan starts with every feature, as Free has. */
	const included = (key: string) => plan?.features.includes(key) ?? true;
	const storageMb = $derived(
		plan?.max_storage_bytes === null || plan?.max_storage_bytes === undefined ? '' : String(plan.max_storage_bytes / MB)
	);

	const progressive = (node: HTMLFormElement) => enhance?.(node);
	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[520px]">
		<Sheet.Header class="bg-muted/5 shrink-0 space-y-1 border-b p-6 text-left">
			<Sheet.Title class="font-serif text-xl font-normal">{title}</Sheet.Title>
			{#if plan?.is_system}
				<Sheet.Description class="text-muted-foreground text-xs">{t('console.plans.form.system_note')}</Sheet.Description>
			{/if}
		</Sheet.Header>

		<!-- Keyed, so each plan starts from its own values, not the last one's draft. -->
		{#key `${mode}:${plan?.id ?? ''}`}
			<form
				method="POST"
				action={mode === 'create' ? '?/create' : '?/update'}
				use:progressive
				class="flex-1 space-y-6 overflow-y-auto p-6"
			>
				{#if plan}<input type="hidden" name="id" value={plan.id} />{/if}

				<div class="grid gap-2">
					<Label for="plan-name" class={labelClass}>{t('console.plans.form.name_label')}</Label>
					<Input
						id="plan-name"
						name="name"
						required
						maxlength={60}
						value={plan?.name ?? ''}
						disabled={readOnly}
						aria-invalid={fieldErrors?.name ? 'true' : undefined}
					/>
					<FieldError message={fieldErrors?.name} />
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="plan-tokens" class={labelClass}>{t('console.plans.form.tokens_label')}</Label>
						<Input
							id="plan-tokens"
							name="max_tokens_month"
							type="number"
							min={0}
							step={1}
							value={plan?.max_tokens_month ?? ''}
							placeholder={t('console.plans.unlimited')}
							disabled={readOnly}
							aria-invalid={fieldErrors?.max_tokens_month ? 'true' : undefined}
						/>
						<FieldError message={fieldErrors?.max_tokens_month} />
					</div>
					<div class="grid gap-2">
						<Label for="plan-storage" class={labelClass}>{t('console.plans.form.storage_label')}</Label>
						<Input
							id="plan-storage"
							name="max_storage_mb"
							type="number"
							min={0}
							step={1}
							value={storageMb}
							placeholder={t('console.plans.unlimited')}
							disabled={readOnly}
							aria-invalid={fieldErrors?.max_storage_bytes ? 'true' : undefined}
						/>
						<FieldError message={fieldErrors?.max_storage_bytes} />
					</div>
					{#if !readOnly}
						<p class="text-subtle col-span-2 text-xs">{t('console.plans.form.limit_hint')}</p>
					{/if}
				</div>

				<fieldset class="grid gap-3">
					<legend class="{labelClass} mb-1">{t('console.plans.form.features_label')}</legend>
					{#each PLAN_FEATURES as feature (feature.key)}
						{@const id = `plan-feature-${feature.key}`}
						<div class="flex items-start gap-3">
							<Checkbox
								{id}
								name="features"
								value={feature.key}
								checked={included(feature.key)}
								disabled={readOnly}
								class="mt-0.5"
							/>
							<Label for={id} class="grid gap-0.5 font-normal">
								<span class="text-sm">{t(feature.label)}</span>
								<span class="text-subtle text-xs">{t(feature.description)}</span>
							</Label>
						</div>
					{/each}
					<FieldError message={fieldErrors?.features ?? fieldErrors?.plan} />
				</fieldset>

				{#if !readOnly}
					<Button type="submit" class="w-full" loading={saving}>{t('console.plans.form.save')}</Button>
				{/if}
			</form>
		{/key}
	</Sheet.Content>
</Sheet.Root>
