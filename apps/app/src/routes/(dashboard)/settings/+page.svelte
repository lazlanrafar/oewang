<script lang="ts">
	/**
	 * Wallets, their groups and categories (US-013).
	 *
	 * Every mutation is a form action, so the page works with JavaScript
	 * disabled: a dialog is a `<form method="POST">` and a row action is a
	 * button inside one. The open tab lives in `?tab=` (UI-8, D55).
	 *
	 * Each wallet balance renders in that wallet's own currency; a group
	 * total renders in the workspace currency, which is the only place this
	 * app converts anything at read time.
	 */
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Plus from '@lucide/svelte/icons/plus';
	import Star from '@lucide/svelte/icons/star';
	import Wallet from '@lucide/svelte/icons/wallet';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import * as Dialog from '$lib/components/atoms/dialog';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import * as Empty from '$lib/components/molecules/empty';
	import FormError from '$lib/components/shell/form-error.svelte';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import { groupWallets, type WalletLike } from '$lib/wallets';
	import { readParam, writeParams } from '$lib/url-state';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const TABS = ['wallets', 'categories'] as const;
	const activeTab = $derived(readParam(page.url, 'tab', TABS, 'wallets'));

	const baseCurrency = $derived(data.me.workspace.currency_code);
	const canEdit = $derived(data.me.role !== 'member');
	const grouped = $derived(
		groupWallets(data.wallets as WalletLike[], data.groups, baseCurrency, data.rates)
	);

	const income = $derived(data.categories.filter((category) => category.type === 'income'));
	const expense = $derived(data.categories.filter((category) => category.type === 'expense'));

	/*
	 * One dialog per purpose, each holding the row it is editing. A dialog
	 * per row would mount one form per wallet; this mounts one and swaps
	 * what it points at.
	 */
	let walletDialog = $state<{ open: boolean; wallet: (typeof data.wallets)[number] | null }>({
		open: false,
		wallet: null
	});
	let groupDialog = $state<{ open: boolean; group: (typeof data.groups)[number] | null }>({
		open: false,
		group: null
	});
	let categoryDialog = $state<{
		open: boolean;
		category: (typeof data.categories)[number] | null;
		type: 'income' | 'expense';
	}>({ open: false, category: null, type: 'expense' });

	/*
	 * One confirmation dialog for every delete on this screen (UI-4).
	 *
	 * The design system's alert dialog rather than the browser's `confirm`,
	 * which blocks the renderer until it is dismissed and cannot be
	 * translated. The form it submits is below, so a delete is still an
	 * ordinary form action.
	 */
	let pendingDelete = $state<{
		open: boolean;
		action: string;
		id: string;
		title: string;
		description: string;
	}>({ open: false, action: '', id: '', title: '', description: '' });
	let deleteForm = $state<HTMLFormElement | null>(null);

	/**
	 * Close the dialog once the action it submitted has succeeded.
	 *
	 * A failure leaves it open with what the user typed still in it, because
	 * the alternative is retyping a form to fix one field.
	 */
	const closeOnSuccess: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				walletDialog = { open: false, wallet: null };
				groupDialog = { open: false, group: null };
				categoryDialog = { ...categoryDialog, open: false, category: null };
			}
			await update();
		};
	};
</script>

<svelte:head><title>{t('settings.title')} · {t('app.name')}</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-6">
	<div>
		<h1 class="text-h2">{t('settings.title')}</h1>
		<p class="text-subtle text-small mt-1">{t('settings.subtitle')}</p>
	</div>

	<!-- The API's own message is for developers; the user sees a dictionary
	     string keyed by the code (UI-1). -->
	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<Tabs.Root value={activeTab} onValueChange={(tab) => writeParams({ tab })}>
		<Tabs.List variant="segmented">
			<Tabs.Trigger value="wallets" variant="segmented">{t('settings.tab_wallets')}</Tabs.Trigger>
			<Tabs.Trigger value="categories" variant="segmented">
				{t('settings.tab_categories')}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- ------------------------------------------------------ wallets -->
		<Tabs.Content value="wallets" class="mt-6 space-y-6">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<p class="text-subtle text-small max-w-md">
					{t('settings.wallets_description', { currency: baseCurrency })}
				</p>
				{#if canEdit}
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							onclick={() => (groupDialog = { open: true, group: null })}
						>
							<FolderPlus />
							{t('settings.new_group')}
						</Button>
						<Button onclick={() => (walletDialog = { open: true, wallet: null })}>
							<Plus />
							{t('settings.new_wallet')}
						</Button>
					</div>
				{/if}
			</div>

			{#if data.wallets.length === 0 && data.groups.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Media><Wallet class="size-5" /></Empty.Media>
						<Empty.Title>{t('settings.no_wallets')}</Empty.Title>
						<Empty.Description>{t('settings.no_wallets_hint')}</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				{#each grouped as group (group.id ?? 'ungrouped')}
					<section class="border">
						<header
							class="bg-muted/5 flex items-center justify-between gap-4 border-b px-4 py-2.5"
						>
							<div class="flex items-center gap-2">
								<h2 class="text-small font-medium">
									{group.name ?? t('settings.ungrouped')}
								</h2>
								{#if group.id && canEdit}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon"
													class="size-6"
													aria-label={t('common.actions')}
												>
													<MoreHorizontal class="size-3.5" />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="start" class="w-48">
											<DropdownMenu.Item
												onclick={() =>
													(groupDialog = {
														open: true,
														group: data.groups.find((g) => g.id === group.id) ?? null
													})}
											>
												{t('common.edit')}
											</DropdownMenu.Item>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												class="text-destructive"
												onclick={() =>
													(pendingDelete = {
														open: true,
														action: '?/deleteGroup',
														id: group.id ?? '',
														title: t('settings.delete_group'),
														description: t('settings.delete_group_confirm', {
															name: group.name ?? ''
														})
													})}
											>
												{t('settings.delete_group')}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</div>

							<div class="text-right">
								<p class="text-subtle text-xs tracking-widest uppercase">
									{t('settings.group_total')}
								</p>
								<p class="text-small font-medium tabular-nums">
									{formatMoney(group.total ?? '0', baseCurrency)}
								</p>
							</div>
						</header>

						{#if group.unconverted > 0}
							<p class="text-subtle border-b px-4 py-2 text-xs">
								{t('settings.group_total_partial', { count: group.unconverted })}
							</p>
						{/if}

						<ul>
							{#each group.wallets as wallet, index (wallet.id)}
								<li class="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
									<Wallet class="text-subtle size-3.5 shrink-0" aria-hidden="true" />

									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="text-body truncate font-medium">{wallet.name}</span>
											{#if wallet.is_default}
												<Badge variant="secondary" class="gap-1">
													<Star class="size-3" />
													{t('settings.default_wallet')}
												</Badge>
											{/if}
											{#if !wallet.is_included_in_totals}
												<Badge variant="outline">{t('settings.include_in_totals')}: no</Badge>
											{/if}
										</div>
										<p class="text-subtle text-xs">{wallet.currency_code}</p>
									</div>

									<!-- The balance is in this wallet's own currency, at that
									     currency's own precision (WAL-2). -->
									<span class="text-body shrink-0 font-medium tabular-nums">
										{formatMoney(wallet.balance, wallet.currency_code)}
									</span>

									{#if canEdit}
										<div class="flex shrink-0 items-center">
											<form method="POST" action="?/moveWallet" use:enhance>
												<input type="hidden" name="id" value={wallet.id} />
												<input type="hidden" name="group_id" value={wallet.group_id ?? ''} />
												<input type="hidden" name="direction" value="up" />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-7"
													disabled={index === 0}
													aria-label={t('common.move_up')}
												>
													<ChevronUp class="size-3.5" />
												</Button>
											</form>
											<form method="POST" action="?/moveWallet" use:enhance>
												<input type="hidden" name="id" value={wallet.id} />
												<input type="hidden" name="group_id" value={wallet.group_id ?? ''} />
												<input type="hidden" name="direction" value="down" />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-7"
													disabled={index === group.wallets.length - 1}
													aria-label={t('common.move_down')}
												>
													<ChevronDown class="size-3.5" />
												</Button>
											</form>

											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<Button
															{...props}
															variant="ghost"
															size="icon"
															class="size-7"
															aria-label={t('common.actions')}
														>
															<MoreHorizontal class="size-3.5" />
														</Button>
													{/snippet}
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end" class="w-52">
													<DropdownMenu.Item
														onclick={() => (walletDialog = { open: true, wallet })}
													>
														{t('common.edit')}
													</DropdownMenu.Item>

													{#if !wallet.is_default}
														<form method="POST" action="?/setDefaultWallet" use:enhance>
															<input type="hidden" name="id" value={wallet.id} />
															<DropdownMenu.Item closeOnSelect={false}>
																{#snippet child({ props })}
																	<button {...props} type="submit" class="w-full text-left">
																		<Check class="size-3.5" />
																		{t('settings.make_default')}
																	</button>
																{/snippet}
															</DropdownMenu.Item>
														</form>
													{/if}

													<DropdownMenu.Separator />
													<DropdownMenu.Item
														class="text-destructive"
														onclick={() =>
															(pendingDelete = {
																open: true,
																action: '?/deleteWallet',
																id: wallet.id,
																title: t('settings.delete_wallet'),
																description: t('settings.delete_wallet_confirm', {
																	name: wallet.name
																})
															})}
													>
														{t('settings.delete_wallet')}
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</Tabs.Content>

		<!-- --------------------------------------------------- categories -->
		<Tabs.Content value="categories" class="mt-6 space-y-6">
			<p class="text-subtle text-small max-w-xl">{t('settings.categories_description')}</p>

			<div class="grid gap-6 md:grid-cols-2">
				{#each [{ type: 'expense' as const, rows: expense }, { type: 'income' as const, rows: income }] as column (column.type)}
					<section class="border">
						<header class="bg-muted/5 flex items-center justify-between border-b px-4 py-2.5">
							<h2 class="text-small font-medium">
								{column.type === 'income' ? t('settings.type_income') : t('settings.type_expense')}
							</h2>
							{#if canEdit}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									aria-label={t('settings.new_category')}
									onclick={() =>
										(categoryDialog = { open: true, category: null, type: column.type })}
								>
									<Plus class="size-3.5" />
								</Button>
							{/if}
						</header>

						{#if column.rows.length === 0}
							<p class="text-subtle px-4 py-6 text-sm">{t('settings.no_categories')}</p>
						{:else}
							<ul>
								{#each column.rows as category, index (category.id)}
									<li class="flex items-center gap-2 border-b px-4 py-2.5 last:border-b-0">
										<span class="text-body min-w-0 flex-1 truncate">{category.name}</span>

										{#if canEdit}
											<form method="POST" action="?/moveCategory" use:enhance>
												<input type="hidden" name="id" value={category.id} />
												<input type="hidden" name="type" value={column.type} />
												<input type="hidden" name="direction" value="up" />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-7"
													disabled={index === 0}
													aria-label={t('common.move_up')}
												>
													<ChevronUp class="size-3.5" />
												</Button>
											</form>
											<form method="POST" action="?/moveCategory" use:enhance>
												<input type="hidden" name="id" value={category.id} />
												<input type="hidden" name="type" value={column.type} />
												<input type="hidden" name="direction" value="down" />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-7"
													disabled={index === column.rows.length - 1}
													aria-label={t('common.move_down')}
												>
													<ChevronDown class="size-3.5" />
												</Button>
											</form>

											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<Button
															{...props}
															variant="ghost"
															size="icon"
															class="size-7"
															aria-label={t('common.actions')}
														>
															<MoreHorizontal class="size-3.5" />
														</Button>
													{/snippet}
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end" class="w-52">
													<DropdownMenu.Item
														onclick={() =>
															(categoryDialog = { open: true, category, type: column.type })}
													>
														{t('common.edit')}
													</DropdownMenu.Item>
													<DropdownMenu.Separator />
													<DropdownMenu.Item
														class="text-destructive"
														onclick={() =>
															(pendingDelete = {
																open: true,
																action: '?/deleteCategory',
																id: category.id,
																title: t('settings.delete_category'),
																description: t('settings.delete_category_confirm', {
																	name: category.name
																})
															})}
													>
														{t('settings.delete_category')}
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/each}
			</div>
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- ----------------------------------------------------------- dialogs -->

<Dialog.Root bind:open={walletDialog.open}>
	<Dialog.Content class="sm:max-w-md">
		<form
			method="POST"
			action={walletDialog.wallet ? '?/updateWallet' : '?/createWallet'}
			use:enhance={closeOnSuccess}
		>
			<Dialog.Header>
				<Dialog.Title>
					{walletDialog.wallet ? t('settings.edit_wallet') : t('settings.new_wallet')}
				</Dialog.Title>
			</Dialog.Header>

			{#if walletDialog.wallet}
				<input type="hidden" name="id" value={walletDialog.wallet.id} />
			{/if}

			<div class="space-y-4 py-4">
				<div class="grid gap-2">
					<Label for="wallet-name" class="text-subtle text-xs font-normal">
						{t('common.name')}
					</Label>
					<Input
						id="wallet-name"
						name="name"
						required
						value={walletDialog.wallet?.name ?? ''}
						placeholder="Cash"
					/>
				</div>

				<div class="grid gap-2">
					<Label for="wallet-group" class="text-subtle text-xs font-normal">
						{t('settings.group')}
					</Label>
					<!-- A native select, so the dialog submits without JavaScript. -->
					<select
						id="wallet-group"
						name="group_id"
						class="border-input bg-background h-9 w-full border px-3 text-sm"
					>
						<option value="">{t('common.none')}</option>
						{#each data.groups as group (group.id)}
							<option value={group.id} selected={walletDialog.wallet?.group_id === group.id}>
								{group.name}
							</option>
						{/each}
					</select>
				</div>

				<div class="grid gap-2">
					<Label for="wallet-currency" class="text-subtle text-xs font-normal">
						{t('settings.currency')}
					</Label>
					<Input
						id="wallet-currency"
						name="currency_code"
						maxlength={3}
						class="uppercase"
						value={walletDialog.wallet?.currency_code ?? ''}
						placeholder={baseCurrency}
					/>
					<p class="text-subtle text-xs">{t('settings.currency_hint')}</p>
				</div>

				<div class="flex items-center gap-2">
					<Checkbox
						id="wallet-totals"
						name="is_included_in_totals"
						value="true"
						checked={walletDialog.wallet?.is_included_in_totals ?? true}
					/>
					<Label for="wallet-totals">{t('settings.include_in_totals')}</Label>
				</div>
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={groupDialog.open}>
	<Dialog.Content class="sm:max-w-sm">
		<form
			method="POST"
			action={groupDialog.group ? '?/updateGroup' : '?/createGroup'}
			use:enhance={closeOnSuccess}
		>
			<Dialog.Header>
				<Dialog.Title>
					{groupDialog.group ? t('settings.edit_group') : t('settings.new_group')}
				</Dialog.Title>
			</Dialog.Header>

			{#if groupDialog.group}
				<input type="hidden" name="id" value={groupDialog.group.id} />
			{/if}

			<div class="py-4">
				<div class="grid gap-2">
					<Label for="group-name" class="text-subtle text-xs font-normal">
						{t('common.name')}
					</Label>
					<Input
						id="group-name"
						name="name"
						required
						value={groupDialog.group?.name ?? ''}
						placeholder="Banks"
					/>
				</div>
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={categoryDialog.open}>
	<Dialog.Content class="sm:max-w-sm">
		<form
			method="POST"
			action={categoryDialog.category ? '?/updateCategory' : '?/createCategory'}
			use:enhance={closeOnSuccess}
		>
			<Dialog.Header>
				<Dialog.Title>
					{categoryDialog.category ? t('settings.edit_category') : t('settings.new_category')}
				</Dialog.Title>
			</Dialog.Header>

			{#if categoryDialog.category}
				<input type="hidden" name="id" value={categoryDialog.category.id} />
			{/if}

			<div class="space-y-4 py-4">
				<div class="grid gap-2">
					<Label for="category-name" class="text-subtle text-xs font-normal">
						{t('common.name')}
					</Label>
					<Input
						id="category-name"
						name="name"
						required
						value={categoryDialog.category?.name ?? ''}
						placeholder="Food"
					/>
				</div>

				<div class="grid gap-2">
					<Label for="category-type" class="text-subtle text-xs font-normal">
						{t('settings.type')}
					</Label>
					<select
						id="category-type"
						name="type"
						class="border-input bg-background h-9 w-full border px-3 text-sm"
					>
						<option
							value="expense"
							selected={(categoryDialog.category?.type ?? categoryDialog.type) === 'expense'}
						>
							{t('settings.type_expense')}
						</option>
						<option
							value="income"
							selected={(categoryDialog.category?.type ?? categoryDialog.type) === 'income'}
						>
							{t('settings.type_income')}
						</option>
					</select>
				</div>
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={pendingDelete.open}
	title={pendingDelete.title}
	description={pendingDelete.description}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>

<!-- The delete every confirmation submits. One form, whichever row it is
     for, because the action and the id are the only things that differ. -->
<form
	bind:this={deleteForm}
	method="POST"
	action={pendingDelete.action}
	class="hidden"
	use:enhance={closeOnSuccess}
>
	<input type="hidden" name="id" value={pendingDelete.id} />
</form>
