<script lang="ts">
	/**
	 * The design system, measured against app.oewang.com.
	 *
	 * Organised the way the components are: foundations, then atoms,
	 * molecules, organisms and whole pages, one tab each, mirroring the
	 * folders under `$lib/components`.
	 *
	 * Development only, and on a bare page: a shell around it would be two
	 * more things whose styles could be mistaken for the specimen's.
	 *
	 * The list on the left is built from what the open tab actually rendered,
	 * by reading the `data-specimen` attribute, so a new specimen appears in
	 * it without being registered anywhere. A registry would be a second list
	 * to keep true, and the one that drifts is always the second.
	 */
	import { tick } from 'svelte';

	import { page } from '$app/state';

	import { Toaster } from '$lib/components/atoms/sonner';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { readParam, writeParams } from '$lib/url-state';

	import Measured from './measured.svelte';
	import Atoms from './sections/atoms.svelte';
	import Foundations from './sections/foundations.svelte';
	import Molecules from './sections/molecules.svelte';
	import Organisms from './sections/organisms.svelte';
	import Pages from './sections/pages.svelte';

	/*
	 * The open tab lives in `?tab=` (UI-8), so a refresh, a shared link and the
	 * back button all land on the same one. The URL is the state: reading it
	 * back is what makes a bad value harmless.
	 */
	const TABS = ['foundations', 'atoms', 'molecules', 'organisms', 'pages', 'measured'] as const;
	const LABELS: Record<(typeof TABS)[number], string> = {
		foundations: 'Foundations',
		atoms: 'Atoms',
		molecules: 'Molecules',
		organisms: 'Organisms',
		pages: 'Pages',
		measured: 'Measured'
	};
	const activeTab = $derived(readParam(page.url, 'tab', TABS, 'foundations'));

	let content = $state<HTMLElement | null>(null);
	let specimens = $state<Array<{ id: string; title: string }>>([]);

	/** Re-read the rendered specimens whenever a different tab is on screen. */
	$effect(() => {
		activeTab;
		tick().then(() => {
			const found = content?.querySelectorAll<HTMLElement>('[data-specimen]') ?? [];
			specimens = Array.from(found)
				// A tab that is not selected keeps its content in the DOM but
				// hidden, and its specimens are not what is being browsed.
				.filter((el) => el.checkVisibility())
				.map((el) => ({ id: el.id, title: el.dataset.title ?? el.id }));
		});
	});

	function show(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<svelte:head><title>Design system</title></svelte:head>

<Toaster />

<div class="mx-auto max-w-7xl pb-24">
	<header class="max-w-3xl">
		<h1 id="spec-h1">Design system</h1>
		<p class="text-subtle text-body mt-2">
			Every component in <code class="text-small font-mono">$lib/components</code>, by atomic
			layer, ported from the old app's <code class="text-small font-mono">packages/ui</code> and
			measured against app.oewang.com rather than estimated, with the shape rules the old app
			actually has: a live radius scale that almost nothing applies, and a shadow scale where
			every step above sm is none (D66). Development only; this route answers 404 anywhere else.
		</p>
	</header>

	<Tabs.Root value={activeTab} onValueChange={(tab) => writeParams({ tab })} class="mt-6">
		<Tabs.List variant="line">
			{#each TABS as tab (tab)}
				<Tabs.Trigger value={tab} variant="line">{LABELS[tab]}</Tabs.Trigger>
			{/each}
		</Tabs.List>

		<div class="flex gap-8 pt-6">
			<!-- The contents list. Sticky, so it stays with the specimens while
			     a long tab is scrolled. -->
			<nav
				aria-label="Specimens"
				class="sticky top-6 hidden h-fit w-48 shrink-0 lg:block"
				class:invisible={specimens.length === 0}
			>
				<p class="text-h4 text-subtle mb-2">{LABELS[activeTab]}</p>
				<ul class="space-y-1 border-l">
					{#each specimens as specimen (specimen.id)}
						<li>
							<button
								type="button"
								class="text-small text-subtle hover:text-foreground -ml-px block w-full border-l border-transparent py-1 pl-3 text-left hover:border-current"
								onclick={() => show(specimen.id)}
							>
								{specimen.title}
							</button>
						</li>
					{/each}
				</ul>
			</nav>

			<div bind:this={content} class="min-w-0 flex-1">
				<Tabs.Content value="foundations" class="space-y-10">
					<Foundations />
				</Tabs.Content>
				<Tabs.Content value="atoms" class="space-y-10">
					<Atoms />
				</Tabs.Content>
				<Tabs.Content value="molecules" class="space-y-10">
					<Molecules />
				</Tabs.Content>
				<Tabs.Content value="organisms" class="space-y-10">
					<Organisms />
				</Tabs.Content>
				<Tabs.Content value="pages" class="space-y-10">
					<Pages />
				</Tabs.Content>
				<Tabs.Content value="measured" class="space-y-10">
					<Measured trigger={activeTab} />
				</Tabs.Content>
			</div>
		</div>
	</Tabs.Root>
</div>
