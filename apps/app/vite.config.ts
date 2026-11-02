import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

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
			// SvelteKit emits an inline bootstrap script on every page. A
			// hand-written `script-src 'self'` blocks it, and the whole app
			// silently stops hydrating: forms still submit because they are
			// real forms, so nothing looks broken until a button that needs
			// JavaScript does nothing. Configured here, SvelteKit adds a nonce
			// to its own script and the policy stays strict (SEC-15).
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['none'],
					'frame-ancestors': ['none'],
					'form-action': ['self']
				}
			}
		})
	],
	server: {
		// The dev server runs in a container; bind so the host can reach it.
		host: '0.0.0.0',
		port: 3000,
		strictPort: true
	}
});
