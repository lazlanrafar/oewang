import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
// From vitest rather than vite, so the `test` block below is part of the
// type. Vite's own `defineConfig` does not know about it.
import { defineConfig } from 'vitest/config';

import { CSP_DIRECTIVES } from './src/lib/security-headers.js';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Runes everywhere except dependencies. See docs/best-practices/svelte-app.md.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// SvelteKit 3 replaced `$lib` with `#lib`, but shadcn-svelte still
			// generates `$lib` imports. Keeping the alias is cheaper than
			// rewriting every component the CLI will regenerate.
			alias: { $lib: 'src/lib' },
			// The CSP is issued by SvelteKit, not by hooks.server.ts.
			//
			// SvelteKit emits an inline bootstrap script and an inlined
			// `<style>` on every page. A hand-written `script-src 'self'`
			// blocks the first, and the whole app silently stops hydrating:
			// forms still submit because they are real forms, so nothing
			// looks broken until a button that needs JavaScript does
			// nothing. Configured here, SvelteKit adds a nonce to both and
			// the policy stays strict (SEC-15).
			//
			// The directives live in `src/lib/security-headers.ts` with the
			// rest of the table, so one file answers "what do we send".
			csp: { mode: 'nonce', directives: CSP_DIRECTIVES }
		})
	],
	/*
	 * Vitest runs the unit tests and nothing else.
	 *
	 * Its default pattern matches `*.spec.ts` too, which would sweep up
	 * `e2e/` and fail on a Playwright import. The two suites are run by
	 * different commands against different things: `bun run test` needs no
	 * stack, `bun run test:e2e` needs all of it.
	 */
	test: {
		include: ['src/**/*.test.ts']
	},

	server: {
		// The dev server runs in a container; bind so the host can reach it.
		host: '0.0.0.0',
		port: 3000,
		strictPort: true
	}
});
