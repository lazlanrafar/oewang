/**
 * Attached files, from the browser's side.
 *
 * The transport lives here rather than in the components that show it. A
 * dropzone and an attachment view are design-system pieces: they know how an
 * upload looks, not where the bytes go. This module knows the routes, the
 * limits and the strings, which is also why it is the only place that has to
 * change when they move.
 *
 * Every request goes to this app's own server, which forwards it to the API
 * inside the OWE1 envelope. The browser is never handed an object-storage URL
 * and never talks to the API (D5, D23, VLT-3).
 */

import type { UploadedFile } from '$lib/components/molecules/file-dropzone';
import { t } from '$lib/i18n';

/** What this product accepts. Nothing that runs when it is opened. */
export const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const CHUNK_BYTES = 512 * 1024;

/** This app's own file routes, which forward to the API (D5). */
const FILES = '/vault/files';

/** The vault grid loads this many at a time, as the old app did. */
export const VAULT_PAGE_SIZE = 15;

/** The picker pages this many, as the old app did. */
export const PICKER_PAGE_SIZE = 12;

/** The form field the API reads an attachment set from. */
const ATTACHMENT_FIELD = 'attachment_ids';

type Progress = (done: number, total: number) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(url: string, body: unknown): Promise<any> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw new Error(await response.text());
	return response.json();
}

/**
 * Split a file in the browser and send it chunk by chunk.
 *
 * Progress is per chunk, which is real progress rather than a bar that jumps
 * from nothing to everything.
 */
export async function uploadFile(file: File, onProgress: Progress): Promise<UploadedFile> {
	const begun = await post(FILES, {
		filename: file.name,
		content_type: file.type,
		size_bytes: file.size
	});

	onProgress(0, begun.chunk_count || 1);

	for (let index = 0; index < begun.chunk_count; index += 1) {
		const start = index * begun.chunk_size;
		const slice = file.slice(start, start + begun.chunk_size);

		const response = await fetch(`${FILES}/${begun.id}/chunks/${index}`, {
			method: 'PUT',
			body: await slice.arrayBuffer()
		});
		if (!response.ok) throw new Error(await response.text());

		onProgress(index + 1, begun.chunk_count);
	}

	const completed = await post(`${FILES}/${begun.id}/complete`, {});
	return {
		id: completed.id,
		name: completed.name,
		type: completed.type,
		size: completed.size,
		thumbnail: completed.thumbnail ?? null
	};
}

/** Fetch an attached file back, chunk by chunk, as the bytes it was. */
export async function loadFile(
	file: { file_id: string; type: string; size: number },
	onProgress: Progress
): Promise<Blob> {
	const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
	const parts: ArrayBuffer[] = [];

	onProgress(0, chunkCount);

	for (let index = 0; index < chunkCount; index += 1) {
		const response = await fetch(`${FILES}/${file.file_id}/chunks/${index}`);
		if (!response.ok) throw new Error(String(response.status));
		parts.push(await response.arrayBuffer());
		onProgress(index + 1, chunkCount);
	}

	// The type comes from the record, which the API sniffed from the bytes.
	// It is never taken from the filename.
	return new Blob(parts, { type: file.type });
}

/** The API's code, if the failure carried one, as something a person reads. */
export function uploadErrorMessage(error: unknown): string {
	const raw = error instanceof Error ? error.message : '';
	if (raw.includes('UNSUPPORTED_FILE_TYPE')) return t('files.error_unsupported_type');
	if (raw.includes('FILE_TOO_LARGE')) return t('files.error_too_large');
	return t('files.error_failed');
}

/**
 * Everything the dropzone needs that belongs to this product rather than to
 * the design system: the transport, the accepted types, the form field and
 * the strings. Spread it, so a caller writes `<FileDropzone bind:files
 * {...attachmentDropzone()} />` and no call site repeats any of it.
 */
export function attachmentDropzone() {
	return {
		upload: uploadFile,
		accept: ACCEPTED_FILE_TYPES,
		name: ATTACHMENT_FIELD,
		label: t('files.attachments'),
		browseLabel: t('files.click_to_browse'),
		prompt: t('files.drag_drop'),
		hint: t('files.upload_hint'),
		busyLabel: t('files.saving'),
		errorMessage: uploadErrorMessage,
		tile: fileTile(),
		picker: filePicker()
	};
}

/** The same, for the preview that shows a file back in its sheet. */
export function filePreview() {
	return {
		load: loadFile,
		loadingLabel: (done: number, total: number) =>
			t('files.loading', { done: String(done), total: String(total) }),
		failedLabel: t('files.unreadable'),
		unavailableLabel: t('files.preview_unavailable'),
		openOriginalLabel: t('files.open_original_file')
	};
}

/**
 * Where a tile's preview comes from: this app's own route, which asks the
 * API for a small square JPEG (D91). `null` when there is none to ask for, so
 * a tile shows its type icon without a request that would only fail.
 */
export function thumbnailSrc(file: { id: string; type: string; thumbnail?: boolean | null }) {
	if (!file.type.startsWith('image/') || file.thumbnail === false) return null;
	return `${FILES}/${file.id}/thumbnail`;
}

/** Bytes as the old app showed them: B, then KB and MB to one decimal. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The subtype, upper-cased by the caller's class, as the old app labelled a format. */
export function formatOf(type: string): string {
	return type.split('/')[1] || type;
}

export type VaultListFile = UploadedFile & {
	tags: string[];
	used_by: number;
	/** `pending` while the receipt reader has it queued, `failed` once it gave up (D95). */
	receipt_status?: 'pending' | 'failed' | null;
	created_at: string;
};

/** A transaction that carries a file (VLT-10). Money stays a string (D12). */
export type LinkedTransaction = {
	id: string;
	name: string | null;
	date: string;
	type: 'income' | 'expense' | 'transfer';
	amount: string;
	currency_code: string;
};

/** A file as its sheet shows it. */
export type VaultFileDetail = UploadedFile & {
	tags: string[];
	created_at: string;
	used_by: number;
	transactions: LinkedTransaction[];
};

export type VaultListQuery = {
	search?: string;
	type?: 'image' | 'pdf' | '';
	size?: 'lt1' | '1to5' | 'gt5' | '';
	sort?: 'newest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';
	page?: number;
	limit?: number;
};

/** One page of the vault, every filter applied by the API (VLT-6). */
export async function listVault(
	query: VaultListQuery
): Promise<{ files: VaultListFile[]; total_pages: number }> {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== '') params.set(key, String(value));
	}
	const response = await fetch(`${FILES}?${params}`);
	if (!response.ok) throw new Error(await response.text());
	return response.json();
}

/**
 * Upload several files at once behind one toast, as the old app did:
 * "Uploading 3 files...", then all done or some failed.
 */
export async function uploadMany(
	files: File[],
	notify: {
		loading: (message: string) => string | number;
		success: (message: string, id: string | number) => void;
		error: (message: string, id: string | number) => void;
	}
): Promise<UploadedFile[]> {
	const accepted = files.filter((file) => ACCEPTED_FILE_TYPES.includes(file.type));
	if (files.length === 0) return [];

	const id = notify.loading(t('vault.toasts.uploading', { count: files.length }));
	const results = await Promise.allSettled(accepted.map((file) => uploadFile(file, () => {})));
	const stored = results
		.filter((result): result is PromiseFulfilledResult<UploadedFile> => result.status === 'fulfilled')
		.map((result) => result.value);

	if (stored.length === files.length) notify.success(t('vault.toasts.upload_success'), id);
	else notify.error(t('vault.toasts.upload_failed_some'), id);

	return stored;
}

/** The picker's strings and transport, spread into `<FilePicker>`. */
export function filePicker() {
	return {
		list: listVault,
		upload: uploadFile,
		thumbnail: thumbnailSrc,
		formatOf,
		formatBytes,
		accept: ACCEPTED_FILE_TYPES,
		pageSize: PICKER_PAGE_SIZE,
		labels: {
			title: t('vault.picker.title'),
			search: t('vault.picker.search'),
			sort: t('vault.picker.sort'),
			sorts: {
				newest: t('vault.picker.sort_newest'),
				name_asc: t('vault.picker.sort_name_asc'),
				name_desc: t('vault.picker.sort_name_desc'),
				size_desc: t('vault.picker.sort_size_desc'),
				size_asc: t('vault.picker.sort_size_asc')
			},
			listView: t('vault.view_list'),
			gridView: t('vault.view_grid'),
			fileType: t('vault.picker.file_type'),
			types: {
				'': t('vault.picker.type_all'),
				image: t('vault.picker.type_image'),
				pdf: t('vault.picker.type_pdf')
			},
			fileSize: t('vault.picker.file_size'),
			sizes: {
				'': t('vault.picker.size_all'),
				lt1: t('vault.picker.size_lt1'),
				'1to5': t('vault.picker.size_1to5'),
				gt5: t('vault.picker.size_gt5')
			},
			sizesShort: {
				lt1: t('vault.picker.size_lt1_short'),
				'1to5': t('vault.picker.size_1to5_short'),
				gt5: t('vault.picker.size_gt5_short')
			},
			addMedia: t('vault.picker.add_media'),
			drop: t('vault.picker.drop'),
			loading: t('vault.picker.loading'),
			empty: t('vault.picker.empty'),
			emptyFiltered: t('vault.picker.empty_filtered'),
			clearSelection: t('vault.picker.clear_selection'),
			page: (page: number, total: number) => t('vault.picker.page', { page, total }),
			previous: t('vault.picker.previous'),
			next: t('vault.picker.next'),
			cancel: t('vault.picker.cancel'),
			done: t('vault.picker.done'),
			select: (name: string) => t('vault.picker.select', { name }),
			uploading: (count: number) => t('vault.toasts.uploading', { count }),
			uploaded: t('vault.toasts.upload_success'),
			uploadFailed: t('vault.toasts.upload_failed_some')
		}
	};
}

/** What a tile says about itself, spread into `<FileTile>`. */
export function fileTile() {
	return {
		thumbnail: thumbnailSrc,
		formatBytes,
		openLabel: (name: string) => t('files.open', { name }),
		removeLabel: (name: string) => t('files.remove', { name })
	};
}
