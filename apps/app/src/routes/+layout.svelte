<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';

	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Applies the stored preference before paint, so a dark-mode user never
     sees a white flash on load. -->
<ModeWatcher />

{@render children()}
