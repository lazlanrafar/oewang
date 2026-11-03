import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The boundary, asserted rather than described (PLT-4, D5, AUTH-3).
 *
 * The browser never calls the API or the AI service, never holds a token
 * and never reads the session cookie. `src/lib/server/` is the only place
 * that may, and SvelteKit refuses to bundle that directory into client
 * code, which makes the import side a build error.
 *
 * What a build error does not catch is the rest: a component reading
 * `process.env`, a page fetching an absolute URL at some other origin, a
 * script touching `document.cookie`. Those compile. So this walks the
 * source and fails on them by name, with the file and the line, because a
 * comment saying "do not do this" is not a control.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');

/**
 * Files allowed to do server things.
 *
 * SvelteKit's own rule, plus this app's: anything under `lib/server`, the
 * hooks, and every `*.server.ts` or `+server.ts`, which only ever run on
 * the server.
 */
function isServerOnly(path: string): boolean {
	const parts = path.split(sep);
	const name = parts.at(-1) ?? '';

	return (
		parts.includes('server') ||
		name === 'hooks.server.ts' ||
		name.endsWith('.server.ts') ||
		name === '+server.ts'
	);
}

type Rule = { name: string; pattern: RegExp; why: string };

const RULES: Rule[] = [
	{
		name: 'a Node builtin',
		pattern: /from\s+['"]node:/,
		why: 'node:crypto and its siblings belong in src/lib/server/ (D5)'
	},
	{
		name: 'process.env',
		pattern: /process\s*\.\s*env/,
		why: 'configuration is read on the server and passed down through load'
	},
	{
		name: 'a fetch to an absolute URL',
		pattern: /fetch\(\s*[`'"]https?:\/\//i,
		why: 'the browser calls this app only, by relative path (PLT-4)'
	},
	{
		name: 'the API or AI service address',
		pattern: /\b(API_URL|AI_SERVICE_URL|AI_SERVICE_API_KEY)\b/,
		why: 'no browser-reachable code may know where the API is'
	},
	{
		name: 'document.cookie',
		pattern: /document\s*\.\s*cookie/,
		why: 'the session cookie is HttpOnly and read only by src/lib/server/session.ts'
	}
];

/** Every source file, with the server-only ones left out. */
function browserReachableFiles(): string[] {
	const found: string[] = [];

	const walk = (directory: string) => {
		for (const entry of readdirSync(directory)) {
			const path = join(directory, entry);

			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}

			if (!/\.(svelte|ts)$/.test(entry)) continue;
			// A test is not shipped to a browser, and this one names every
			// forbidden string in its own rule table.
			if (entry.endsWith('.test.ts')) continue;
			if (isServerOnly(relative(src, path))) continue;

			found.push(path);
		}
	};

	walk(src);
	return found;
}

describe('the server boundary', () => {
	const files = browserReachableFiles();

	it('finds the source to check', () => {
		// A walk that silently matched nothing would pass every rule below.
		expect(files.length).toBeGreaterThan(100);
	});

	for (const rule of RULES) {
		it(`finds no ${rule.name} in browser-reachable code`, () => {
			const offenders: string[] = [];

			for (const path of files) {
				const lines = readFileSync(path, 'utf8').split('\n');

				lines.forEach((line, index) => {
					// A comment may legitimately name the thing it forbids.
					if (/^\s*(\/\/|\*|\/\*|<!--)/.test(line)) return;
					if (rule.pattern.test(line)) {
						offenders.push(`${relative(src, path)}:${index + 1}  ${line.trim()}`);
					}
				});
			}

			expect(offenders, `${rule.why}\n${offenders.join('\n')}`).toEqual([]);
		});
	}

	/**
	 * `import type` is erased, so it ships nothing.
	 *
	 * A page naming `Transaction` from `$lib/server/ledger` is describing
	 * the shape its own `load` already handed it, which is the point of
	 * having one definition of that shape. What may not happen is a value
	 * import: `import { api }` pulls the client, its crypto and the URL of
	 * the API into the bundle. `import { type Foo }` counts as a value
	 * import, because the module is still imported for its side effects.
	 */
	it('imports nothing from $lib/server but a type', () => {
		const IMPORT = /import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
		const offenders: string[] = [];

		for (const path of files) {
			// Comments may name the module they are describing.
			const source = readFileSync(path, 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/^\s*\/\/.*$/gm, '');

			for (const [, typeOnly, specifiers, module] of source.matchAll(IMPORT)) {
				if (!module.includes('$lib/server/')) continue;
				if (typeOnly) continue;

				offenders.push(`${relative(src, path)}  import ${specifiers} from '${module}'`);
			}
		}

		expect(offenders, offenders.join('\n')).toEqual([]);
	});

	it('keeps the server directory as the only holder of the API client', () => {
		// The positive half: the client exists, and it is where it should be.
		const client = readFileSync(join(src, 'lib/server/api.ts'), 'utf8');

		expect(client).toContain('API_URL');
		expect(isServerOnly('lib/server/api.ts')).toBe(true);
	});

	it('treats a route handler as server-only and a component as not', () => {
		// The classifier is the whole test; a wrong one would exempt the
		// files that matter.
		expect(isServerOnly(join('routes', '(dashboard)', 'chat', 'stream', '+server.ts'))).toBe(true);
		expect(isServerOnly(join('routes', '(dashboard)', 'transactions', '+page.server.ts'))).toBe(
			true
		);
		expect(isServerOnly('hooks.server.ts')).toBe(true);
		expect(isServerOnly(join('lib', 'server', 'owe1', 'protocol.ts'))).toBe(true);

		expect(isServerOnly(join('routes', '(dashboard)', 'transactions', '+page.svelte'))).toBe(
			false
		);
		expect(isServerOnly(join('lib', 'receipt.ts'))).toBe(false);
	});
});
