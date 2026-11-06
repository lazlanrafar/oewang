<script lang="ts">
	/**
	 * The avatar menu at the right of the top bar, the old app's
	 * `AccountSwitcher` (D94): the name and email on top, then Account, the
	 * theme, and Log out in red. Billing, notifications and language are not
	 * here, because each belongs to a feature this product does not have.
	 */
	import Check from '@lucide/svelte/icons/check';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Plug from '@lucide/svelte/icons/plug';
	import Sun from '@lucide/svelte/icons/sun';
	import { setMode, userPrefersMode } from 'mode-watcher';

	import * as Avatar from '$lib/components/atoms/avatar';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { t } from '$lib/i18n';

	let {
		name,
		email,
		photo
	}: {
		name: string | null;
		email: string;
		/** The photo's own URL on this app, or null for the initial. */
		photo: string | null;
	} = $props();

	let logout = $state<HTMLFormElement | null>(null);

	const initial = $derived((name || email).trim().charAt(0).toUpperCase() || '?');
	const themes = [
		{ value: 'light', label: 'nav.theme_light', icon: Sun },
		{ value: 'dark', label: 'nav.theme_dark', icon: Moon },
		{ value: 'system', label: 'nav.theme_system', icon: Monitor }
	] as const;
</script>

<!-- A form, not a link: signing out is a state change, and a GET that
     mutates is a GET a prefetcher can fire. -->
<form bind:this={logout} method="POST" action="/logout" class="hidden"></form>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button {...props} type="button" class="rounded-full" aria-label={t('account.menu_label')}>
				<Avatar.Root class="size-9 cursor-pointer rounded-full">
					{#if photo}<Avatar.Image src={photo} alt="" />{/if}
					<Avatar.Fallback class="rounded-full">{initial}</Avatar.Fallback>
				</Avatar.Root>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="min-w-56 space-y-1" align="end">
		<div class="flex w-full items-center gap-2 px-2 py-2">
			<div class="grid min-w-0 flex-1 text-left text-sm leading-tight">
				<span class="truncate font-semibold">{name || email}</span>
				<span class="truncate text-muted-foreground text-xs">{email}</span>
			</div>
		</div>
		<DropdownMenu.Separator />
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href="/account/profile">
					<CircleUser />
					{t('account.menu_account')}
				</a>
			{/snippet}
		</DropdownMenu.Item>
		<!-- MCP is the person's, like the account, so it sits beside it (D106). -->
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href="/account/mcp">
					<Plug />
					{t('account.menu_mcp')}
				</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger>
				<Sun />
				{t('account.menu_theme')}
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent>
				{#each themes as theme (theme.value)}
					<DropdownMenu.Item onSelect={() => setMode(theme.value)}>
						<theme.icon />
						{t(theme.label)}
						{#if userPrefersMode.current === theme.value}<Check class="ml-auto" />{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
		<DropdownMenu.Separator />
		<DropdownMenu.Item class="text-destructive" onSelect={() => logout?.requestSubmit()}>
			<LogOut class="text-destructive" />
			{t('account.menu_log_out')}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
