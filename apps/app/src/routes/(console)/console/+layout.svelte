<script lang="ts">
	/**
	 * The operator console (CSL, D124), laid out as the account area is: the
	 * sidebar at a fifth of the width and the section beside it, under a bar
	 * with the product's mark and the operator. Wider than the account area,
	 * because console screens are tables.
	 */
	import { Logo } from '$lib/components/atoms/logo';
	import { Button } from '$lib/components/atoms/button';
	import { Toaster } from '$lib/components/atoms/sonner';
	import { SettingsSidebar } from '$lib/components/organisms/settings';
	import { t } from '$lib/i18n';
	import { consoleNavFor } from '$lib/nav';

	let { children, data } = $props();

	const groups = $derived(consoleNavFor(data.operator.permissions));
</script>

<Toaster />
<main class="bg-background mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-8 p-4 md:p-6">
	<div class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-2">
			<Logo class="size-6" />
			<span class="font-serif text-lg tracking-tight">{t('console.title')}</span>
		</div>
		<form method="POST" action="/logout" class="flex items-center gap-3">
			<span class="text-muted-foreground truncate text-xs">
				{t('console.signed_in_as', { email: data.operator.email, role: data.operator.role.name })}
			</span>
			<Button type="submit" variant="outline" size="sm">{t('console.sign_out')}</Button>
		</form>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-12">
		<aside class="shrink-0 lg:w-1/5">
			<SettingsSidebar {groups} label={t('console.title')} />
		</aside>
		<div class="flex min-w-0 flex-1 flex-col">
			{@render children()}
		</div>
	</div>
</main>
