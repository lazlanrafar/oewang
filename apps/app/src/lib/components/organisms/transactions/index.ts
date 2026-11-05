/**
 * Everything that knows what a transaction is.
 *
 * The table shell, its geometry and its virtualisation are the design
 * system's (`$lib/components/molecules/data-table`); the columns, the row
 * model, the sort keys and the grouping are here, because only this module
 * knows them.
 */
export { default as ImportAiModal } from './transactions-import-ai-modal.svelte';
export { default as ReceiptCanvas } from './transactions-receipt-canvas.svelte';
export { default as ReceiptConfirmationSheet } from './transactions-receipt-confirmation-sheet.svelte';
export { default as TransactionBulkBar } from './transactions-bulk-bar.svelte';
export { default as TransactionDetailSheet } from './transactions-detail-sheet.svelte';
export type { TransactionDetail } from './transactions-detail-sheet.svelte';
export { default as TransactionExportModal } from './transactions-export-modal.svelte';
export { default as TransactionFormFields } from './transactions-form-fields.svelte';
export { emptyDraft, type TransactionDraft } from './transactions-form-fields.svelte';
export { default as TransactionFormSheet } from './transactions-form-sheet.svelte';
export { default as TransactionsPage } from './transactions-page.svelte';

export { default as TransactionsDataTable } from './transactions-data-table.svelte';
export { TRANSACTION_COLUMNS, type ColumnKey } from './transactions-data-table-column.js';
export {
	GROUPINGS,
	groupKey,
	groupLabel,
	type Grouping
} from './transactions-data-table-grouping.js';
export type {
	SortKey,
	TransactionRow,
	TransactionSort
} from './transactions-data-table-types.js';
