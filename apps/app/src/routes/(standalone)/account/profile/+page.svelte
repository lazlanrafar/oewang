<script lang="ts">
	/**
	 * Profile, the old app's `SettingProfileForm` (D94): the 80px square
	 * photo with "Upload New" beside it, the name, the email read only, and
	 * one "Update profile" button. The old form's mobile number is not
	 * here: nothing in this product reads one.
	 *
	 * The photo uploads the moment it is chosen, as the old one did, after
	 * the browser has shrunk it.
	 */
	import Loader2 from '@lucide/svelte/icons/loader-circle';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Avatar from '$lib/components/atoms/avatar';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { shrinkToBase64 } from '$lib/images';
	import { pageTitle } from '$lib/page-title';

	let { data, form } = $props();

	const user = $derived(data.me.user);
	const initial = $derived((user.name || user.email).trim().charAt(0).toUpperCase() || '?');
	const photo = $derived(
		user.profile_picture ? `/account/photo?v=${encodeURIComponent(user.profile_picture)}` : null
	);

	let name = $state('');
	$effect(() => {
		name = user.name ?? '';
	});

	let saving = $state(false);
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let photoForm = $state<HTMLFormElement | null>(null);
	let photoData = $state('');

	async function chosen(file: File | undefined) {
		if (!file) return;
		uploading = true;
		try {
			photoData = await shrinkToBase64(file);
		} catch {
			uploading = false;
			toast.error(t('account.profile.photo_failed'));
			return;
		}
		await tick();
		photoForm?.requestSubmit();
	}

	function after(done: string) {
		return () =>
			async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
				saving = false;
				uploading = false;
				if (result.type === 'success') {
					toast.success(
						done === 'photo'
							? t('account.profile.photo_saved')
							: done === 'photo_removed'
								? t('account.profile.photo_removed')
								: t('account.profile.saved')
					);
					await invalidateAll();
				} else if (result.type === 'failure') {
					const code = String(result.data?.code ?? '');
					toast.error(
						done === 'profile' ? messageForCode(code) : t('account.profile.photo_failed')
					);
				}
			};
	}
</script>

<svelte:head>
	<title>{pageTitle(t('account.profile.title'), t('account.title'))}</title>
</svelte:head>

<div class="space-y-8">
	<SettingsSectionHeader
		title={t('account.profile.title')}
		description={t('account.profile.description')}
	/>

	<form bind:this={photoForm} method="POST" action="?/photo" class="hidden" use:enhance={after('photo')}>
		<input type="hidden" name="data" value={photoData} />
	</form>

	<div class="flex items-center gap-6">
		<Avatar.Root class="size-20 rounded-none">
			{#if photo}<Avatar.Image src={photo} alt="" class="rounded-none" />{/if}
			<Avatar.Fallback class="rounded-none text-xl">{initial}</Avatar.Fallback>
		</Avatar.Root>
		<div class="space-y-2">
			<Label for="avatar-upload">{t('account.profile.photo_label')}</Label>
			<div class="flex items-center gap-3">
				<input
					bind:this={fileInput}
					id="avatar-upload"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					class="hidden"
					onchange={(event) => {
						chosen((event.currentTarget as HTMLInputElement).files?.[0]);
						(event.currentTarget as HTMLInputElement).value = '';
					}}
				/>
				<Button
					type="button"
					variant="outline"
					class="h-8 text-xs"
					disabled={uploading}
					onclick={() => fileInput?.click()}
				>
					{#if uploading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{:else}
						<Upload class="mr-2 h-4 w-4" />
					{/if}
					{t('account.profile.photo_upload')}
				</Button>
				{#if photo}
					<form method="POST" action="?/removePhoto" use:enhance={after('photo_removed')}>
						<Button type="submit" variant="ghost-destructive" class="h-8 text-xs">
							<Trash2 class="mr-2 h-4 w-4" />
							{t('account.profile.photo_remove')}
						</Button>
					</form>
				{/if}
			</div>
			<p class="text-[11px] text-muted-foreground">{t('account.profile.photo_formats')}</p>
		</div>
	</div>

	<form
		method="POST"
		action="?/update"
		class="space-y-8"
		use:enhance={() => {
			saving = true;
			return after('profile')();
		}}
	>
		<div class="space-y-2">
			<Label for="profile-name">{t('account.profile.name_label')}</Label>
			<Input
				id="profile-name"
				name="name"
				class="max-w-md"
				maxlength={80}
				placeholder={t('account.profile.name_placeholder')}
				bind:value={name}
			/>
			<p class="text-muted-foreground text-xs">{t('account.profile.name_description')}</p>
			<FieldError message={form?.done === 'profile' ? form?.fields?.name : undefined} />
		</div>

		<div class="space-y-2">
			<Label for="profile-email">{t('account.profile.email_label')}</Label>
			<Input id="profile-email" class="max-w-md" value={user.email} disabled />
			<p class="text-muted-foreground text-xs">{t('account.profile.email_description')}</p>
		</div>

		<Button type="submit" class="h-8 text-xs" disabled={saving}>
			{#if saving}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
			{t('account.profile.save')}
		</Button>
	</form>
</div>
