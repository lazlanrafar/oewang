<script lang="ts">
	/**
	 * Add an operator, or change one's role (CSL-2, US-085). Adding finds a
	 * registered user by email; both pick a role from the console's roles.
	 * The form posts to the page's `?/save`, which owns it.
	 */
	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { SelectConsoleRole } from '$lib/components/molecules/select-console-role';
	import { SelectConsoleUser } from '$lib/components/molecules/select-console-user';
	import { t } from '$lib/i18n';
	import type { ConsoleOperator, ConsoleRole } from '$lib/server/console';

	let {
		open = $bindable(false),
		operator,
		roles,
		saving = false,
		fieldErrors,
		enhance
	}: {
		open?: boolean;
		/** Null adds a new operator; otherwise this one's role changes. */
		operator: ConsoleOperator | null;
		roles: ConsoleRole[];
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The save, owned by the page. */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	let userId = $state('');
	let roleId = $state('');

	// Each opening starts from the operator it is for, or from nothing.
	$effect(() => {
		if (!open) return;
		userId = operator?.user_id ?? '';
		roleId = operator?.role_id ?? '';
	});

	const progressive = (node: HTMLFormElement) => enhance?.(node);
	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[480px]">
		<Sheet.Header class="bg-muted/5 shrink-0 space-y-1 border-b p-6 text-left">
			<Sheet.Title class="font-serif text-xl font-normal">
				{operator ? t('console.operators.form.change_title') : t('console.operators.form.add_title')}
			</Sheet.Title>
			<Sheet.Description class="text-muted-foreground text-xs">
				{operator ? operator.email : t('console.operators.form.add_description')}
			</Sheet.Description>
		</Sheet.Header>

		<form method="POST" action="?/save" use:progressive class="flex-1 space-y-6 overflow-y-auto p-6">
			{#if operator}
				<input type="hidden" name="user_id" value={operator.user_id} />
			{:else}
				<div class="grid gap-2">
					<Label for="operator-user" class={labelClass}>{t('console.operators.form.user_label')}</Label>
					<SelectConsoleUser
						id="operator-user"
						name="user_id"
						bind:value={userId}
						placeholder={t('console.operators.form.user_placeholder')}
						searchPlaceholder={t('console.operators.form.user_search')}
						ariaLabel={t('console.operators.form.user_label')}
					/>
					<FieldError message={fieldErrors?.user} />
				</div>
			{/if}

			<div class="grid gap-2">
				<Label for="operator-role" class={labelClass}>{t('console.operators.form.role_label')}</Label>
				<SelectConsoleRole
					id="operator-role"
					name="role_id"
					{roles}
					bind:value={roleId}
					placeholder={t('console.operators.form.role_placeholder')}
					searchPlaceholder={t('console.operators.form.role_search')}
					ariaLabel={t('console.operators.form.role_label')}
				/>
				<FieldError message={fieldErrors?.role_id} />
			</div>

			<Button type="submit" class="w-full" loading={saving} disabled={!userId || !roleId}>
				{t('console.operators.form.save')}
			</Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
