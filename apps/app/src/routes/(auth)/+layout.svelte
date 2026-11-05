<script lang="ts">
	import { Logo } from '$lib/components/atoms/logo';
	import { t } from '$lib/i18n';

	let { children } = $props();
</script>

<div class="flex min-h-svh items-center justify-center px-4 py-10">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center gap-3">
			<Logo class="size-10" />
			<p class="font-serif text-xl tracking-tight">{t('app.name')}</p>
		</div>
		{@render children()}
	</div>
</div>
