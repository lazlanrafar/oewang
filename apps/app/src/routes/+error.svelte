<script lang="ts">
	/**
	 * Every error page, 404, 401, 403, 500, 503 and anything else, drawn in
	 * the brand's own voice (D101): the eyebrow, the serif headline with its
	 * last words in italic brand green, as oewang.com sets its hero, over the
	 * status as a large faint numeral, as its 404 does.
	 *
	 * The root one, so it also catches a failure in the dashboard layout's
	 * own load. Copy is ours per status, never the error's message: an
	 * unexpected error's message is SvelteKit's generic one, and an expected
	 * one is not written for this page.
	 */
	import { page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import { t, type TranslationKey } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	type Kind = 'not_found' | 'unauthorized' | 'forbidden' | 'unavailable' | 'server' | 'other';

	const kind = $derived<Kind>(
		page.status === 404
			? 'not_found'
			: page.status === 401
				? 'unauthorized'
				: page.status === 403
					? 'forbidden'
					: page.status === 503
						? 'unavailable'
						: page.status >= 500
							? 'server'
							: 'other'
	);

	const key = (part: 'lead' | 'emphasis' | 'description') =>
		`error_page.${kind}_${part}` as TranslationKey;

	/** A failure worth repeating gets "try again"; a missing page does not. */
	const retryable = $derived(kind === 'server' || kind === 'unavailable');
</script>

<svelte:head>
	<title>{pageTitle(`${page.status} ${t(key('lead'))} ${t(key('emphasis'))}`)}</title>
</svelte:head>

<main class="bg-background flex min-h-svh items-center justify-center px-6 py-16">
	<div class="relative flex max-w-md flex-col items-center text-center">
		<!-- The status as texture, not as the message: faint, behind. -->
		<p
			class="text-foreground/[0.06] pointer-events-none font-serif text-[9rem] leading-none tracking-tight select-none sm:text-[12rem]"
			aria-hidden="true"
		>
			{page.status}
		</p>

		<p class="text-primary -mt-6 text-[11px] font-medium tracking-[0.3em] uppercase sm:-mt-10">
			<span aria-hidden="true">•</span>
			{t('error_page.eyebrow', { status: page.status })}
		</p>

		<h1 class="text-foreground mt-4 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">
			{t(key('lead'))}
			<em class="text-primary italic">{t(key('emphasis'))}</em>
		</h1>

		<p class="text-subtle mt-4 text-sm leading-relaxed">{t(key('description'))}</p>

		<div class="mt-8 flex flex-wrap items-center justify-center gap-2">
			{#if kind === 'unauthorized'}
				<Button href="/login">{t('error_page.sign_in')}</Button>
			{:else}
				<Button href="/overview">{t('error_page.go_home')}</Button>
			{/if}

			{#if retryable}
				<Button variant="outline" onclick={() => location.reload()}>
					{t('error_page.try_again')}
				</Button>
			{:else}
				<Button variant="outline" onclick={() => history.back()}>
					{t('error_page.go_back')}
				</Button>
			{/if}
		</div>
	</div>
</main>
