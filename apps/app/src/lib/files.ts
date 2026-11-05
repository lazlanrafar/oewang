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
	const begun = await post('/transactions/files', {
		filename: file.name,
		content_type: file.type,
		size_bytes: file.size
	});

	onProgress(0, begun.chunk_count || 1);

	for (let index = 0; index < begun.chunk_count; index += 1) {
		const start = index * begun.chunk_size;
		const slice = file.slice(start, start + begun.chunk_size);

		const response = await fetch(`/transactions/files/${begun.id}/chunks/${index}`, {
			method: 'PUT',
			body: await slice.arrayBuffer()
		});
		if (!response.ok) throw new Error(await response.text());

		onProgress(index + 1, begun.chunk_count);
	}

	const completed = await post(`/transactions/files/${begun.id}/complete`, {});
	return {
		id: completed.id,
		name: completed.name,
		type: completed.type,
		size: completed.size
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
		const response = await fetch(`/transactions/files/${file.file_id}/chunks/${index}`);
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
		prompt: t('files.drop'),
		chooseLabel: t('files.choose'),
		hint: t('files.hint'),
		busyLabel: t('files.uploading'),
		rejectedMessage: t('files.error_rejected_type'),
		removeLabel: (name: string) => t('files.remove', { name }),
		errorMessage: uploadErrorMessage
	};
}

/** The same, for the view that shows an attached file back. */
export function attachmentViewer() {
	return {
		load: loadFile,
		downloadLabel: (name: string) => t('files.download', { name }),
		loadingLabel: (done: number, total: number) =>
			t('files.loading', { done: String(done), total: String(total) }),
		failedLabel: t('files.unreadable')
	};
}
