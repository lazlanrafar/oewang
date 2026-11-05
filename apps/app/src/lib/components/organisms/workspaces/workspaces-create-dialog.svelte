<script lang="ts">
	/**
	 * "Add workspace" from the switcher, the old app's
	 * `CreateWorkspaceDialog`: a 450px dialog with the business-details form.
	 *
	 * It posts to the workspaces page's own action, which creates the
	 * workspace, switches into it and lands on its overview. The old dialog
	 * created the workspace and left the user in the previous one.
	 */
	import * as Dialog from '../../atoms/dialog/index.js';
	import { t } from '$lib/i18n';

	import WorkspacesFormFields from './workspaces-form-fields.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let pending = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[450px]">
		<Dialog.Header>
			<Dialog.Title>{t('workspaces.dialog_title')}</Dialog.Title>
			<Dialog.Description>{t('workspaces.dialog_description')}</Dialog.Description>
		</Dialog.Header>
		<!-- A plain post: switching workspace reloads every list the shell
		     holds, which is what a full navigation does. -->
		<form method="POST" action="/workspaces?/create" class="py-4" onsubmit={() => (pending = true)}>
			<WorkspacesFormFields {pending} autofocus />
		</form>
	</Dialog.Content>
</Dialog.Root>
