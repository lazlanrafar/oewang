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
			alias: { $lib: 'src/lib' }
		})
	],
	server: {
		// The dev server runs in a container; bind so the host can reach it.
		host: '0.0.0.0',
		port: 3000,
		strictPort: true
	}
});
