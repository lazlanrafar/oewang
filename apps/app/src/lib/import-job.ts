/**
 * A statement import job, as the modal polls it (AI-4, TXN-16, TXN-17).
 *
 * The upload answers `202 {job_id}` and a background task does the work, so
 * the modal's whole job is to ask again until the answer changes
 * (docs/features/transactions.md#image-and-pdf-statement). Pure, so the
 * phase rule is tested without a timer.
 */

export type ImportJobStatus = 'pending' | 'succeeded' | 'failed';

export type ImportRowStatus = 'imported' | 'duplicate' | 'skipped';

/**
 * One row of the statement, as the model read it.
 *
 * The figures are the strings the extraction produced and nothing has
 * re-parsed them, which is what makes this a review rather than a summary:
 * the user is checking what was read, not what was computed.
 */
export type ImportRow = {
	date: string;
	name: string;
	amount: string;
	direction: string;
	status: ImportRowStatus;
};

/**
 * The review list, null until the job finishes.
 *
 * Capped at 200 rows. `truncated` says the **list** was cut, never the
 * counts: those are exact for the whole file, up to 5,000 rows. The screen
 * has to keep those two facts apart, because a user who reads "200" beside
 * the word imported has been told something false.
 */
export type ImportReview = { rows: ImportRow[]; truncated: boolean };

export type ImportJob = {
	id: string;
	status: ImportJobStatus;
	/** The statement itself, which a retry reuses rather than re-uploading. */
	vault_file_id: string | null;
	/** Null on the wire until the job finishes, which reads as nothing done. */
	imported: number;
	skipped: number;
	duplicates: number;
	/** The rows, once the job has finished. Null while it is running. */
	review: ImportReview | null;
	/** The API's code for a failure, or null. Mapped to a string by `errors.ts`. */
	error: string | null;
	/** The API's own verdict on a job that has been pending too long. */
	stale: boolean;
	created_at: string;
	updated_at: string;
};

/** Every two seconds, as the feature doc specifies. */
export const IMPORT_POLL_INTERVAL = 2000;

/**
 * What the modal shows.
 *
 * `stale` is a phase rather than a flag on `pending`, because it is the one
 * case where the modal stops waiting and offers a retry instead of spinning
 * forever (D12 in the Midday research, P12). Staleness is the API's call,
 * not this code's: the job's clock is the server's, and a browser whose
 * clock is wrong would otherwise declare a healthy job dead.
 */
export type ImportPhase = 'pending' | 'stale' | 'succeeded' | 'failed';

export function jobPhase(job: ImportJob): ImportPhase {
	if (job.status !== 'pending') return job.status;
	return job.stale ? 'stale' : 'pending';
}

/** Whether polling should stop. A stale job keeps its row but gains nothing by asking again. */
export function isSettled(job: ImportJob): boolean {
	return jobPhase(job) !== 'pending';
}

/**
 * Read a poll response, checking every field.
 *
 * A body without an id is not a job. Returning null rather than a job with
 * empty fields keeps the modal from reporting "0 imported" for a request
 * that never answered.
 */
export function parseImportJob(value: unknown): ImportJob | null {
	const job = record(value);
	const id = typeof job?.id === 'string' ? job.id : '';
	if (id === '') return null;

	return {
		id,
		status: status(job?.status),
		vault_file_id: typeof job?.vault_file_id === 'string' ? job.vault_file_id : null,
		imported: count(job?.imported),
		skipped: count(job?.skipped),
		duplicates: count(job?.duplicates),
		review: review(job?.review),
		error: typeof job?.error === 'string' && job.error !== '' ? job.error : null,
		stale: job?.stale === true,
		created_at: typeof job?.created_at === 'string' ? job.created_at : '',
		updated_at: typeof job?.updated_at === 'string' ? job.updated_at : ''
	};
}

function review(value: unknown): ImportReview | null {
	const body = record(value);
	if (!body || !Array.isArray(body.rows)) return null;

	const rows: ImportRow[] = [];

	for (const entry of body.rows) {
		const row = record(entry);
		if (!row) continue;

		rows.push({
			date: text(row.date),
			name: text(row.name),
			amount: text(row.amount),
			direction: text(row.direction),
			status: rowStatus(row.status)
		});
	}

	return { rows, truncated: body.truncated === true };
}

/** An unrecognised row status reads as skipped: it did not become a row. */
function rowStatus(value: unknown): ImportRowStatus {
	return value === 'imported' || value === 'duplicate' ? value : 'skipped';
}

/**
 * Whether a reviewed row is worth a second look.
 *
 * There is no per-row confidence number and nothing here invents one.
 * These are the honest signals the response actually carries: a row that
 * did not become a transaction, and a row missing the two fields a
 * transaction cannot do without.
 */
export function needsAttention(row: ImportRow): boolean {
	return row.status === 'skipped' || row.date === '' || row.amount === '';
}

/** An unknown status reads as pending: the job exists, so it has not failed. */
function status(value: unknown): ImportJobStatus {
	return value === 'succeeded' || value === 'failed' ? value : 'pending';
}

/**
 * A count, or zero.
 *
 * The three counts are null on the wire until the job finishes, which is
 * the same thing as nothing having happened yet. A fraction and a negative
 * are neither, and come back as zero rather than on screen.
 */
function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
