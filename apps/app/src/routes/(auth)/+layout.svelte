<script lang="ts">
	import { t } from '$lib/i18n';

	let { children } = $props();
</script>

<div class="flex min-h-svh items-center justify-center px-4 py-10">
	<div class="w-full max-w-sm">
		<p class="mb-8 text-center font-serif text-xl font-semibold tracking-tight">
			{t('app.name')}
		</p>
		{@render children()}
	</div>
</div>
