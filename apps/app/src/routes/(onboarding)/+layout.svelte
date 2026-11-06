<script lang="ts">
	/**
	 * Before the workspace (D109): the check page, creating the first
	 * workspace, and joining one by invitation. Outside the app shell and
	 * the account area alike, because the session has no workspace for
	 * either to read. The old app's auth column: centred, full height.
	 */
	let { children } = $props();
</script>

<main class="bg-background flex min-h-dvh justify-center p-2">
	{@render children()}
</main>
