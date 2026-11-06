<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';

	import { page } from '$app/state';

	import '../app.css';
	import { markHydrated } from '$lib/hydration';
	import { t } from '$lib/i18n';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// What the server rendered is on screen from here on: a figure mounted
	// after this counts up, one hydrated before it does not (D108).
	onMount(markHydrated);

	/* A link preview needs an absolute image URL; the origin is the request's. */
	const ogImage = $derived(`${page.url.origin}/og-image.png`);
</script>

<!--
	The old app's metadata (its root layout and `app/icon.svg` plus
	`favicon.ico`), with the website's touch icon and link preview image,
	which carry the same mark. The icons themselves are in `app.html`, so
	they are there before any script runs. Each page sets its own title
	through `pageTitle`; none is set here, because a second `<title>` in the
	head is the one a browser would show.
-->
<svelte:head>
	<meta name="description" content={t('app.description')} />
	<meta name="application-name" content={t('app.name')} />
	<meta name="apple-mobile-web-app-title" content={t('app.name')} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={t('app.name')} />
	<meta property="og:title" content={t('app.title_default')} />
	<meta property="og:description" content={t('app.description')} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={t('app.title_default')} />
	<meta name="twitter:description" content={t('app.description')} />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

<!--
	Tracks and writes the preference. The before-paint part is in
	`app.html`, which is the only file that can carry `%sveltekit.nonce%`:
	this component's own injected script has no nonce, so the policy refuses
	it and the flash it exists to prevent comes back (SEC-15).
-->
<ModeWatcher defaultMode="light" disableHeadScriptInjection />

{@render children()}
