import { describe, expect, it } from 'vitest';

import { readSort, sortParams, userActions, workspaceActions, workspaceStatus } from './console';

const at = (query: string) => new URL(`https://console.test/console/users${query}`);

describe('US-081 the console list sort in the URL', () => {
	it('should start newest first with nothing in the URL', () => {
		expect(readSort(at(''))).toEqual({ key: 'created_at', descending: true });
	});

	it('should read a sort and its order back', () => {
		expect(readSort(at('?sort=email&order=asc'))).toEqual({ key: 'email', descending: false });
	});

	it('should leave the default unsaid, and write any other sort with its order', () => {
		expect(sortParams({ key: 'created_at', descending: true })).toEqual({ sort: null, order: null, page: null });
		expect(sortParams({ key: null, descending: false })).toEqual({ sort: null, order: null, page: null });
		expect(sortParams({ key: 'created_at', descending: false })).toEqual({
			sort: 'created_at',
			order: 'asc',
			page: null
		});
		expect(sortParams({ key: 'name', descending: true })).toEqual({ sort: 'name', order: 'desc', page: null });
	});

	it('should round-trip a written sort', () => {
		const written = sortParams({ key: 'email', descending: false });
		expect(readSort(at(`?sort=${written.sort}&order=${written.order}`))).toEqual({
			key: 'email',
			descending: false
		});
	});
});

describe('US-082 a workspace status', () => {
	const at = '2026-11-20T00:00:00Z';

	it('should be active with neither mark, suspended with one, and deleted whenever deleted', () => {
		expect(workspaceStatus({ deleted_at: null, suspended_at: null })).toBe('active');
		expect(workspaceStatus({ deleted_at: null, suspended_at: at })).toBe('suspended');
		expect(workspaceStatus({ deleted_at: at, suspended_at: null })).toBe('deleted');
		expect(workspaceStatus({ deleted_at: at, suspended_at: at })).toBe('deleted');
	});
});

describe('US-082 the actions a sheet offers', () => {
	const at = '2026-11-20T00:00:00Z';
	const all = ['console.read', 'console.workspaces.suspend', 'console.workspaces.restore', 'console.users.disable'];

	it('should offer restore only for a deleted workspace, and suspend or unsuspend otherwise', () => {
		expect(workspaceActions({ deleted_at: at, suspended_at: at }, all)).toEqual(['restore']);
		expect(workspaceActions({ deleted_at: null, suspended_at: null }, all)).toEqual(['suspend']);
		expect(workspaceActions({ deleted_at: null, suspended_at: at }, all)).toEqual(['unsuspend']);
	});

	it('should offer nothing the operator lacks the permission for', () => {
		expect(workspaceActions({ deleted_at: at, suspended_at: null }, ['console.workspaces.suspend'])).toEqual([]);
		expect(workspaceActions({ deleted_at: null, suspended_at: null }, ['console.workspaces.restore'])).toEqual([]);
		expect(userActions({ disabled_at: null, console_role: null }, ['console.read'])).toEqual([]);
	});

	it('should never offer to disable an operator, but always to enable a disabled user', () => {
		expect(userActions({ disabled_at: null, console_role: null }, all)).toEqual(['disable']);
		expect(userActions({ disabled_at: null, console_role: 'support' }, all)).toEqual([]);
		expect(userActions({ disabled_at: at, console_role: 'support' }, all)).toEqual(['enable']);
	});
});
