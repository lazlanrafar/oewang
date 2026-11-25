<script lang="ts">
	/**
	 * One console role (CSL-2, US-085): create it, edit it, or read it. The
	 * eight permissions are a checkbox list; one the signed-in operator does
	 * not hold is disabled, because nobody can hand out more than they have
	 * (the API refuses it too). The system role and the operator's own role
	 * are read only. The form posts to the page's `?/create` or `?/update`.
	 */
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { CONSOLE_PERMISSIONS } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleRole } from '$lib/server/console';

	let {
		open = $bindable(false),
		role,
		mode,
		held,
		saving = false,
		fieldErrors,
		enhance
	}: {
		open?: boolean;
		/** Null when creating. */
		role: ConsoleRole | null;
		mode: 'create' | 'edit' | 'view';
		/** The permissions the signed-in operator holds. */
		held: readonly string[];
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The save, owned by the page. */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const readOnly = $derived(mode === 'view');
	const title = $derived(
		mode === 'create'
			? t('console.roles.form.create_title')
			: mode === 'edit'
				? t('console.roles.form.edit_title')
				: t('console.roles.form.view_title')
	);

	const progressive = (node: HTMLFormElement) => enhance?.(node);
	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[520px]">
		<Sheet.Header class="bg-muted/5 shrink-0 space-y-1 border-b p-6 text-left">
			<Sheet.Title class="font-serif text-xl font-normal">{title}</Sheet.Title>
			{#if readOnly && role}
				<Sheet.Description class="text-muted-foreground text-xs">
					{role.is_system ? t('console.roles.form.system_note') : t('console.roles.form.yours_note')}
				</Sheet.Description>
			{/if}
		</Sheet.Header>

		<!-- Keyed, so each role starts from its own values, not the last one's draft. -->
		{#key `${mode}:${role?.id ?? ''}`}
			<form
				method="POST"
				action={mode === 'create' ? '?/create' : '?/update'}
				use:progressive
				class="flex-1 space-y-6 overflow-y-auto p-6"
			>
				{#if role}<input type="hidden" name="id" value={role.id} />{/if}

				<div class="grid gap-2">
					<Label for="role-name" class={labelClass}>{t('console.roles.form.name_label')}</Label>
					<Input
						id="role-name"
						name="name"
						required
						maxlength={60}
						value={role?.name ?? ''}
						disabled={readOnly}
						aria-invalid={fieldErrors?.name ? 'true' : undefined}
					/>
					<FieldError message={fieldErrors?.name} />
				</div>

				<div class="grid gap-2">
					<Label for="role-description" class={labelClass}>{t('console.roles.form.description_label')}</Label>
					<Textarea
						id="role-description"
						name="description"
						rows={2}
						maxlength={200}
						value={role?.description ?? ''}
						placeholder={t('console.roles.form.description_placeholder')}
						disabled={readOnly}
						aria-invalid={fieldErrors?.description ? 'true' : undefined}
					/>
					<FieldError message={fieldErrors?.description} />
				</div>

				<fieldset class="grid gap-3">
					<legend class="{labelClass} mb-1">{t('console.roles.form.permissions_label')}</legend>
					{#if !readOnly}
						<p class="text-subtle text-xs">{t('console.roles.form.permissions_hint')}</p>
					{/if}
					{#each CONSOLE_PERMISSIONS as permission (permission.key)}
						{@const id = `role-permission-${permission.key}`}
						<div class="flex items-start gap-3">
							<Checkbox
								{id}
								name="permissions"
								value={permission.key}
								checked={role?.permissions.includes(permission.key) ?? false}
								disabled={readOnly || !held.includes(permission.key)}
								class="mt-0.5"
							/>
							<Label for={id} class="grid gap-0.5 font-normal">
								<span class="text-sm">{t(permission.label)}</span>
								<span class="text-subtle text-xs">{t(permission.description)}</span>
							</Label>
						</div>
					{/each}
					<FieldError message={fieldErrors?.permissions ?? fieldErrors?.role} />
				</fieldset>

				{#if !readOnly}
					<Button type="submit" class="w-full" loading={saving}>{t('console.roles.form.save')}</Button>
				{/if}
			</form>
		{/key}
	</Sheet.Content>
</Sheet.Root>
