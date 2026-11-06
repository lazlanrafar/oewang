<script lang="ts">
	/**
	 * The budget form, laid out to the same SHEET_GUIDE rules as the account
	 * and transaction sheets: content at `p-0`, a header with no rule, a body
	 * with `pb-[100px]`, and one full-width submit over it.
	 *
	 * Two fields, the old page's: an expense category and a monthly limit in
	 * the workspace currency. The category is fixed once the budget exists;
	 * a limit for another category is another budget (BUD-1).
	 *
	 * It writes nothing itself. The form posts to the page's action, and the
	 * page decides what a save means by passing its own `enhance`.
	 */
	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { CurrencyInput } from '$lib/components/molecules/currency-input';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { SelectCategory } from '$lib/components/molecules/select-category';
	import { t } from '$lib/i18n';
	import { currencyDigits, currencySymbol } from '$lib/money';
	import type { BudgetLine } from '$lib/reports';

	let {
		open = $bindable(false),
		onOpenChange,
		budget = null,
		currency,
		saving = false,
		fieldErrors,
		createLabel,
		enhance
	}: {
		open?: boolean;
		/** Fires when the primitive closes itself, on Escape or the overlay. */
		onOpenChange?: (open: boolean) => void;
		/** The budget being edited, or null to create one. */
		budget?: BudgetLine | null;
		/** The workspace currency, which every limit is in. */
		currency: string;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		/** SvelteKit's `enhance`, passed in so the page owns the save. */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const editing = $derived(!!budget);

	let categoryId = $state('');
	let amount = $state('');

	/* The sheet is reused for the next budget, so the fields follow it. */
	$effect(() => {
		if (!open) return;
		categoryId = budget?.category_id ?? '';
		amount = budget?.amount ? trimZeros(budget.amount) : '';
	});

	/** `2000000.0000` as `2000000`: the column's scale is not the user's. */
	function trimZeros(value: string): string {
		return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
	}

	/** A no-op action, so a caller that passes no `enhance` posts natively. */
	const progressive = (node: HTMLFormElement) => enhance?.(node);

	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<form
			method="POST"
			action={budget ? '?/update' : '?/create'}
			use:progressive
			class="flex h-full flex-col"
		>
			{#if budget}
				<input type="hidden" name="id" value={budget.id} />
			{/if}

			<Sheet.Header class="shrink-0 px-6 pt-6">
				<Sheet.Title class="text-lg">
					{editing ? t('budget.edit') : t('budget.new')}
				</Sheet.Title>
				<Sheet.Description class="sr-only">{t('budget.form_description')}</Sheet.Description>
			</Sheet.Header>

			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
				<div class="space-y-6">
					<div class="grid gap-2">
						<Label for="budget-category" class={labelClass}>{t('budget.col_category')}</Label>
						<!-- Expense categories only: a budget limits spending (BUD-1). -->
						<SelectCategory
							id="budget-category"
							type="expense"
							creatable={!editing}
							disabled={editing}
							bind:value={categoryId}
							placeholder={t('budget.category_placeholder')}
							{createLabel}
						/>
						<input type="hidden" name="category_id" value={categoryId} />
						<FieldError message={fieldErrors?.category_id} />
					</div>

					<div class="grid gap-2">
						<Label for="budget-amount" class={labelClass}>{t('budget.monthly_limit')}</Label>
						<!-- The hidden input is what submits: the field groups its
						     display, and the grouped text is not a number. -->
						<CurrencyInput
							id="budget-amount"
							bind:value={amount}
							symbol={currencySymbol(currency)}
							decimals={currencyDigits(currency)}
						/>
						<input type="hidden" name="amount" value={amount} />
						<FieldError message={fieldErrors?.amount} />
					</div>
				</div>
			</div>

			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button type="submit" class="w-full" loading={saving}>
					{editing ? t('budget.save') : t('budget.create')}
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
