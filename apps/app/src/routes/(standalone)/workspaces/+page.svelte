<script lang="ts">
	/**
	 * The workspaces page, outside the app shell (D94).
	 *
	 * Built in the old app's onboarding look, since the old app had no page
	 * like this to copy: a 450px column centred on the screen, the old
	 * `Steps`-header's back link, a `font-sans text-2xl` heading. The list
	 * rows are the old plan cards (a bordered button, the chosen one in
	 * `border-foreground bg-foreground/5`), here marking the current
	 * workspace. The form below is the old business-details form.
	 *
	 * Choosing a workspace posts a plain form, so the app reloads inside it.
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Loader2 from '@lucide/svelte/icons/loader-circle';
	import { tick } from 'svelte';

	import { Badge } from '$lib/components/atoms/badge';
	import { Logo } from '$lib/components/atoms/logo';
	import { FormError } from '$lib/components/molecules/form-error';
	import { WorkspacesFormFields } from '$lib/components/organisms/workspaces';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { cn } from '$lib/utils';
	import { roleLabel, workspaceInitial } from '$lib/workspaces';

	let { data, form } = $props();

	let target = $state('');
	let switchForm = $state<HTMLFormElement | null>(null);
	let creating = $state(false);

	async function choose(id: string) {
		if (id === data.me.workspace.id) {
			window.location.href = '/overview';
			return;
		}
		target = id;
		await tick();
		switchForm?.requestSubmit();
	}
</script>

<svelte:head><title>{pageTitle(t('workspaces.page_title'))}</title></svelte:head>

<form bind:this={switchForm} method="POST" action="?/switch" class="hidden">
	<input type="hidden" name="workspace_id" value={target} />
	<input type="hidden" name="next" value="/overview" />
</form>

<main class="bg-background flex min-h-dvh justify-center p-2">
	<div class="mx-auto flex w-full flex-col justify-center space-y-8 py-10 sm:w-[450px]">
		<div class="flex items-center justify-between">
			<a
				href="/overview"
				class="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
			>
				<ArrowLeft class="size-3" />
				{t('workspaces.back')}
			</a>
			<Logo class="size-6" />
		</div>

		<div class="space-y-3">
			<h1 class="font-sans text-2xl tracking-tight">{t('workspaces.page_title')}</h1>
			<p class="text-muted-foreground text-sm leading-relaxed">{t('workspaces.description')}</p>
		</div>

		<FormError message={form?.code && !form?.fields ? messageForCode(form.code) : undefined} />

		<ul class="space-y-2">
			{#each data.workspaces as workspace (workspace.id)}
				{@const current = workspace.id === data.me.workspace.id}
				<li>
					<button
						type="button"
						class={cn(
							'flex w-full items-center gap-3 border px-4 py-3 text-left transition-all',
							current
								? 'border-foreground bg-foreground/5'
								: 'border-border/60 hover:border-border hover:bg-muted/20'
						)}
						aria-current={current ? 'true' : undefined}
						aria-label={t('workspaces.open', { name: workspace.name })}
						disabled={target !== ''}
						onclick={() => choose(workspace.id)}
					>
						<span
							class="flex size-8 shrink-0 items-center justify-center border font-semibold text-xs"
						>
							{workspaceInitial(workspace.name)}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-sm">{workspace.name}</span>
							<span class="mt-0.5 block text-muted-foreground text-xs">
								{roleLabel(workspace.role)} · {workspace.currency_code}
							</span>
						</span>
						{#if target === workspace.id}
							<Loader2 class="size-4 animate-spin text-muted-foreground" />
						{:else if current}
							<Badge variant="muted">{t('workspaces.current')}</Badge>
						{:else}
							<ChevronRight class="size-4 text-muted-foreground" />
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		<div class="space-y-6 border-t pt-8">
			<div class="space-y-3">
				<h2 class="font-sans text-2xl tracking-tight">{t('workspaces.create_title')}</h2>
				<p class="text-muted-foreground text-sm leading-relaxed">
					{t('workspaces.create_description')}
				</p>
			</div>
			<form method="POST" action="?/create" onsubmit={() => (creating = true)}>
				<WorkspacesFormFields pending={creating} errors={form?.fields} />
			</form>
		</div>
	</div>
</main>
