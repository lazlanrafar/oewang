<script lang="ts">
	/**
	 * Appearance: the theme, and the colours income and expense are drawn
	 * in (UI-12, D100). The theme is this browser's, applied at once, like
	 * the account menu's; the colours are this user's and saved. A swatch, a
	 * free colour, or the default; the preview follows before saving, and the
	 * whole app follows after.
	 *
	 * Groups are separated by a rule, not boxed: a settings section reads as
	 * one page, at the same width as every other section.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { setMode, userPrefersMode } from 'mode-watcher';

	import { enhance, type SubmitFunction } from '$app/forms';

	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import { Separator } from '$lib/components/atoms/separator';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SettingsSectionGroup, SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { EXPENSE_PRESETS, INCOME_PRESETS, isHexColor } from '$lib/colors';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import { pageTitle } from '$lib/page-title';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let income = $state<string | null>(null);
	let expense = $state<string | null>(null);
	let saved = $state(false);

	$effect(() => {
		income = data.me.user.income_color;
		expense = data.me.user.expense_color;
	});

	const markSaved: SubmitFunction = () => {
		return async ({ result, update }) => {
			saved = result.type === 'success';
			await update();
		};
	};

	const fields = $derived([
		{
			key: 'income_color',
			label: t('settings.income_color_label'),
			presets: INCOME_PRESETS,
			value: income,
			set: (next: string | null): void => {
				income = next;
				saved = false;
			},
			token: 'hsl(var(--green))'
		},
		{
			key: 'expense_color',
			label: t('settings.expense_color_label'),
			presets: EXPENSE_PRESETS,
			value: expense,
			set: (next: string | null): void => {
				expense = next;
				saved = false;
			},
			token: 'hsl(var(--red))'
		}
	]);

	const currency = $derived(data.me.workspace.currency_code);

	/* "System" stays reachable, so a choice can be handed back to the OS. */
	const themes = [
		{ value: 'light', label: t('nav.theme_light'), icon: Sun },
		{ value: 'dark', label: t('nav.theme_dark'), icon: Moon },
		{ value: 'system', label: t('nav.theme_system'), icon: Monitor }
	] as const;
</script>

<svelte:head>
	<title>{pageTitle(t('settings.appearance_title'), t('settings.title'))}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader
		title={t('settings.appearance_title')}
		description={t('settings.appearance_description')}
	/>

	<SettingsSectionGroup
		title={t('settings.theme_label')}
		description={t('settings.theme_description')}
	>
		<div class="flex flex-wrap gap-2" role="group" aria-label={t('settings.theme_label')}>
			{#each themes as theme (theme.value)}
				<Button
					type="button"
					variant="outline"
					size="sm"
					aria-pressed={userPrefersMode.current === theme.value}
					onclick={() => setMode(theme.value)}
				>
					<theme.icon />
					{theme.label}
					{#if userPrefersMode.current === theme.value}<Check class="size-3.5" />{/if}
				</Button>
			{/each}
		</div>
	</SettingsSectionGroup>

	<Separator />

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<SettingsSectionGroup
		title={t('settings.colors_label')}
		description={t('settings.colors_description')}
	>
		<form method="POST" action="?/updateColors" use:enhance={markSaved} class="space-y-6">
			{#each fields as field (field.key)}
				<fieldset class="grid gap-3">
					<legend class="text-subtle mb-1 text-xs font-normal">{field.label}</legend>
					<input type="hidden" name={field.key} value={field.value ?? ''} />

					<div class="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-pressed={field.value === null}
							onclick={() => field.set(null)}
						>
							<span class="size-3 border" style="background: {field.token}" aria-hidden="true"
							></span>
							{t('settings.color_default')}
							{#if field.value === null}<Check class="size-3.5" />{/if}
						</Button>

						{#each field.presets as preset (preset)}
							<button
								type="button"
								class="flex size-8 items-center justify-center border"
								style="background: {preset}"
								aria-pressed={field.value === preset}
								aria-label={t('settings.color_swatch', { color: preset })}
								onclick={() => field.set(preset)}
							>
								{#if field.value === preset}
									<Check class="size-4 text-white mix-blend-difference" />
								{/if}
							</button>
						{/each}

						<Label class="text-subtle ml-1 flex items-center gap-2 text-xs font-normal">
							<input
								type="color"
								class="size-8 cursor-pointer border bg-transparent p-0.5"
								value={isHexColor(field.value) ? field.value : field.presets[0]}
								oninput={(event) => field.set(event.currentTarget.value.toLowerCase())}
							/>
							{t('settings.color_custom')}
						</Label>
					</div>
				</fieldset>
			{/each}

			<div class="grid gap-1">
				<p class="text-subtle text-[10px] font-medium tracking-widest uppercase">
					{t('settings.color_preview')}
				</p>
				<p class="font-medium tabular-nums" style="color: {income ?? 'hsl(var(--green))'}">
					{formatMoney('125000', currency, { signed: true })}
				</p>
				<p class="font-medium tabular-nums" style="color: {expense ?? 'hsl(var(--red))'}">
					{formatMoney('-48200', currency)}
				</p>
				<p class="text-subtle text-xs">{t('settings.color_hint')}</p>
			</div>

			<div class="flex items-center gap-3">
				<Button type="submit">{t('common.save')}</Button>
				{#if saved}
					<p class="text-subtle text-xs" role="status">{t('settings.saved')}</p>
				{/if}
			</div>
		</form>
	</SettingsSectionGroup>
</div>
