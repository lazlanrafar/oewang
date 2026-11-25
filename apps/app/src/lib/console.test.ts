import { describe, expect, it } from 'vitest';

import {
	auditDiff,
	auditEntityHref,
	feedbackPatch,
	formatShortDay,
	readMonth,
	readSort,
	shiftMonth,
	sortParams,
	userActions,
	workspaceActions,
	workspaceStatus
} from './console';
import { consoleNavFor, navActive } from './nav';

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

describe('US-083 the feedback form body', () => {
	const form = (entries: Record<string, string>) => {
		const data = new FormData();
		for (const [key, value] of Object.entries(entries)) data.set(key, value);
		return data;
	};

	it('should send only what the form carries', () => {
		expect(feedbackPatch(form({ id: 'f1', status: 'done' }))).toEqual({ status: 'done' });
		expect(feedbackPatch(form({ id: 'f1', operator_note: '  called them  ' }))).toEqual({
			operator_note: 'called them'
		});
	});

	it('should clear a blank note and drop a status that is not one', () => {
		expect(feedbackPatch(form({ operator_note: '   ' }))).toEqual({ operator_note: null });
		expect(feedbackPatch(form({ status: 'closed' }))).toEqual({});
	});
});

describe('US-084 the usage month', () => {
	it('should accept only a real YYYY-MM', () => {
		expect(readMonth('2026-11')).toBe('2026-11');
		expect(readMonth('2026-13')).toBeNull();
		expect(readMonth('2026-1')).toBeNull();
		expect(readMonth(null)).toBeNull();
	});

	it('should step across a year boundary both ways', () => {
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftMonth('2026-11', -1)).toBe('2026-10');
	});

	it('should print a plain day as that day whatever the zone', () => {
		expect(formatShortDay('2026-11-01')).toBe('1 Nov');
	});
});

describe('US-085 the operator audit', () => {
	it('should line up before and after field by field and mark what changed', () => {
		expect(
			auditDiff(
				{ status: 'open', note: null, tags: ['a'] },
				{ status: 'done', note: null, tags: ['a'], resolved_at: '2026-11-25' }
			)
		).toEqual([
			{ key: 'status', before: 'open', after: 'done', changed: true },
			{ key: 'note', before: '—', after: '—', changed: false },
			{ key: 'tags', before: '["a"]', after: '["a"]', changed: false },
			{ key: 'resolved_at', before: '—', after: '2026-11-25', changed: true }
		]);
	});

	it('should read a created or deleted thing as one side only', () => {
		expect(auditDiff(null, { name: 'support' })).toEqual([
			{ key: 'name', before: '—', after: 'support', changed: true }
		]);
		expect(auditDiff(null, null)).toEqual([]);
	});

	it('should link each audited thing to its screen, and nothing else', () => {
		expect(auditEntityHref('user', 'u 1')).toBe('/console/users?user=u%201');
		expect(auditEntityHref('workspace', 'w1')).toBe('/console/workspaces?workspace=w1');
		expect(auditEntityHref('feedback', 'f1')).toBe('/console/feedback?feedback=f1');
		expect(auditEntityHref('console_role', 'r1')).toBe('/console/roles');
		expect(auditEntityHref('session', 's1')).toBeNull();
	});
});

describe('the console sidebar marks the current page', () => {
	const rows = consoleNavFor(['console.read']).flatMap((group) => group.items);
	const overview = rows.find((item) => item.href === '/console')!;
	const users = rows.find((item) => item.href === '/console/users')!;

	it('should light the overview on /console only', () => {
		expect(navActive(overview, '/console')).toBe(true);
		expect(navActive(overview, '/console/users')).toBe(false);
	});

	it('should keep a section lit on its own sub-paths', () => {
		expect(navActive(users, '/console/users')).toBe(true);
		expect(navActive(users, '/console/users/search')).toBe(true);
		expect(navActive(users, '/console/workspaces')).toBe(false);
	});
});
