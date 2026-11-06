<script lang="ts">
	/**
	 * Create the first workspace (D109), in the old app's onboarding look:
	 * a 450px column, a `font-sans text-2xl` heading over a muted line, the
	 * business-details fields with a full-width submit. The old second step,
	 * choosing a plan, is gone with billing (D92).
	 *
	 * Above it, where the old page had nothing, who is signed in and a way
	 * out: someone who signed up with the wrong address must not be stuck
	 * on a page that only offers to make a workspace.
	 */
	import LogOut from '@lucide/svelte/icons/log-out';

	import { Logo } from '$lib/components/atoms/logo';
	import { FormError } from '$lib/components/molecules/form-error';
	import { WorkspacesFormFields } from '$lib/components/organisms/workspaces';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	let { data, form } = $props();

	let creating = $state(false);
</script>

<svelte:head><title>{pageTitle(t('onboarding.create_page_title'))}</title></svelte:head>

<div class="mx-auto flex w-full flex-col justify-center space-y-8 py-10 sm:w-[450px]">
	<div class="flex items-center justify-between">
		<Logo class="size-6" />
		<form method="POST" action="/logout" class="flex items-center gap-3">
			<span class="text-muted-foreground truncate text-xs">
				{t('onboarding.signed_in_as', { email: data.email })}
			</span>
			<button
				type="submit"
				class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
			>
				<LogOut class="size-3" />
				{t('nav.sign_out')}
			</button>
		</form>
	</div>

	<div class="space-y-3">
		<h1 class="font-sans text-2xl tracking-tight">{t('workspaces.create_title')}</h1>
		<p class="text-muted-foreground text-sm leading-relaxed">
			{t('workspaces.create_description')}
		</p>
	</div>

	<FormError message={form?.code && !form?.fields ? messageForCode(form.code) : undefined} />

	<form method="POST" onsubmit={() => (creating = true)}>
		<WorkspacesFormFields pending={creating} errors={form?.fields} autofocus />
	</form>
</div>
