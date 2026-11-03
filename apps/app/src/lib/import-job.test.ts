import { describe, expect, it } from 'vitest';

import {
	isSettled,
	jobPhase,
	needsAttention,
	parseImportJob,
	type ImportJob,
	type ImportRow
} from './import-job';

const job = (overrides: Partial<ImportJob> = {}): ImportJob => ({
	id: 'clxjob',
	status: 'pending',
	vault_file_id: 'clxfile',
	imported: 0,
	skipped: 0,
	duplicates: 0,
	review: null,
	error: null,
	stale: false,
	created_at: '2026-11-03T04:00:00Z',
	updated_at: '2026-11-03T04:00:00Z',
	...overrides
});

describe('parseImportJob', () => {
	it('reads a finished job', () => {
		expect(
			parseImportJob({
				id: 'clxjob',
				status: 'succeeded',
				vault_file_id: 'clxfile',
				imported: 12,
				skipped: 1,
				duplicates: 3,
				error: null,
				review: null,
				stale: false,
				created_at: '2026-11-03T04:00:00Z',
				updated_at: '2026-11-03T04:01:00Z'
			})
		).toEqual(job({ status: 'succeeded', imported: 12, skipped: 1, duplicates: 3, updated_at: '2026-11-03T04:01:00Z' }));
	});

	it('returns null for a body that is not a job', () => {
		// "0 imported" is a worse answer than "nothing came back".
		expect(parseImportJob(null)).toBeNull();
		expect(parseImportJob({})).toBeNull();
		expect(parseImportJob({ status: 'succeeded' })).toBeNull();
	});

	it('reads an unknown status as pending', () => {
		// The job exists, so it has not failed.
		expect(parseImportJob({ id: 'clxjob', status: 'queued' })?.status).toBe('pending');
		expect(parseImportJob({ id: 'clxjob' })?.status).toBe('pending');
	});

	it('refuses a count that is not one', () => {
		const parsed = parseImportJob({ id: 'clxjob', imported: '12', skipped: -4, duplicates: 2.7 });

		expect(parsed?.imported).toBe(0);
		expect(parsed?.skipped).toBe(0);
		expect(parsed?.duplicates).toBe(2);
	});

	it('reads the null counts of a pending job as nothing done', () => {
		// The API sends null for all three until the job finishes.
		const parsed = parseImportJob({
			id: 'clxjob',
			status: 'pending',
			imported: null,
			skipped: null,
			duplicates: null
		});

		expect(parsed).toMatchObject({ imported: 0, skipped: 0, duplicates: 0 });
	});

	it('keeps the file id, so a retry does not upload again', () => {
		expect(parseImportJob({ id: 'clxjob', vault_file_id: 'clxfile' })?.vault_file_id).toBe(
			'clxfile'
		);
		expect(parseImportJob({ id: 'clxjob' })?.vault_file_id).toBeNull();
	});

	it('reads the review list once the job finishes', () => {
		const parsed = parseImportJob({
			id: 'clxjob',
			status: 'succeeded',
			review: {
				rows: [
					{
						date: '2026-11-02',
						name: 'WARUNG TEKKO',
						amount: '87500',
						direction: 'expense',
						status: 'imported'
					}
				],
				truncated: true
			}
		});

		expect(parsed?.review).toEqual({
			rows: [
				{
					date: '2026-11-02',
					name: 'WARUNG TEKKO',
					amount: '87500',
					direction: 'expense',
					status: 'imported'
				}
			],
			truncated: true
		});
	});

	it('has no review while the job is running', () => {
		expect(parseImportJob({ id: 'clxjob', status: 'pending' })?.review).toBeNull();
		expect(parseImportJob({ id: 'clxjob', review: { truncated: true } })?.review).toBeNull();
	});

	it('reads an unrecognised row status as skipped', () => {
		// It did not become a transaction, whatever it is called.
		const parsed = parseImportJob({
			id: 'clxjob',
			review: { rows: [{ name: 'A', status: 'deferred' }] }
		});

		expect(parsed?.review?.rows[0]).toEqual({
			date: '',
			name: 'A',
			amount: '',
			direction: '',
			status: 'skipped'
		});
	});

	it('reads an empty error as no error', () => {
		expect(parseImportJob({ id: 'clxjob', error: '' })?.error).toBeNull();
		expect(parseImportJob({ id: 'clxjob', error: 'EXTRACTION_FAILED' })?.error).toBe(
			'EXTRACTION_FAILED'
		);
	});
});

describe('jobPhase', () => {
	it('waits on a pending job', () => {
		expect(jobPhase(job())).toBe('pending');
	});

	it('offers a retry on a stale one', () => {
		// The alternative is a modal that spins forever (P12).
		expect(jobPhase(job({ stale: true }))).toBe('stale');
	});

	it('reports a finished job whatever the stale flag says', () => {
		expect(jobPhase(job({ status: 'succeeded', stale: true }))).toBe('succeeded');
		expect(jobPhase(job({ status: 'failed' }))).toBe('failed');
	});
});

describe('isSettled', () => {
	it('keeps polling only while the job is genuinely pending', () => {
		expect(isSettled(job())).toBe(false);
		expect(isSettled(job({ stale: true }))).toBe(true);
		expect(isSettled(job({ status: 'succeeded' }))).toBe(true);
		expect(isSettled(job({ status: 'failed' }))).toBe(true);
	});
});

describe('needsAttention', () => {
	const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
		date: '2026-11-02',
		name: 'WARUNG TEKKO',
		amount: '87500',
		direction: 'expense',
		status: 'imported',
		...overrides
	});

	it('leaves a complete imported row alone', () => {
		expect(needsAttention(row())).toBe(false);
		expect(needsAttention(row({ status: 'duplicate' }))).toBe(false);
	});

	it('flags a row that did not become a transaction', () => {
		expect(needsAttention(row({ status: 'skipped' }))).toBe(true);
	});

	it('flags a row missing what a transaction cannot do without', () => {
		// There is no per-row confidence number, so these are the signals
		// the response honestly carries.
		expect(needsAttention(row({ date: '' }))).toBe(true);
		expect(needsAttention(row({ amount: '' }))).toBe(true);
	});
});
