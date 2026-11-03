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

<!--
	Tracks and writes the preference. The before-paint part is in
	`app.html`, which is the only file that can carry `%sveltekit.nonce%`:
	this component's own injected script has no nonce, so the policy refuses
	it and the flash it exists to prevent comes back (SEC-15).
-->
<ModeWatcher disableHeadScriptInjection />

{@render children()}
