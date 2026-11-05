<script lang="ts">
	/**
	 * Settings, laid out as the old app's `settings/layout.tsx` (D82): the
	 * settings sidebar on the left at a fifth of the width, the section on
	 * the right, each scrolling on its own. Below `lg` they stack, sidebar
	 * first, as they did there.
	 *
	 * The section column is the one that scrolls, as the old layout's
	 * `overflow-y-auto` content div did, so a section is laid out at its
	 * natural height and never manages its own scrolling.
	 */
	import { SettingsSidebar } from '$lib/components/organisms/settings';

	let { children } = $props();
</script>

<div class="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-12">
	<!-- Capped while stacked, as the old app capped it at 300px, so the
	     section below keeps the height its table fills. -->
	<aside class="max-h-72 shrink-0 overflow-y-auto lg:max-h-none lg:w-1/5">
		<SettingsSidebar />
	</aside>
	<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:max-w-3xl">
		{@render children()}
	</div>
</div>
