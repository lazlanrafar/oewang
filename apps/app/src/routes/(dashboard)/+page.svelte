<script lang="ts">
	import { t } from '$lib/i18n';

	let { data } = $props();
</script>

<div class="mx-auto max-w-2xl">
	<h1 class="font-serif text-2xl font-semibold tracking-tight">{data.me.workspace.name}</h1>
	<p class="text-muted-foreground mt-2 text-sm">
		{t('shell.signed_in_as', { email: data.me.user.email })} · {data.me.role}
	</p>
	<p class="text-muted-foreground/70 mt-6 text-sm">{t('shell.scaffold_notice')}</p>
</div>
