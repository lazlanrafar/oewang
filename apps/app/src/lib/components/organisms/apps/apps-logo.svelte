<script lang="ts">
	/**
	 * An app's mark, drawn inline so it needs no request and no asset
	 * pipeline. Telegram's is the old app's `telegram/assets/logo.tsx`.
	 */
	import type { AppId } from '$lib/apps';
	import { cn } from '$lib/utils';

	let { id, size = 'md', class: className }: { id: AppId; size?: 'md' | 'lg'; class?: string } = $props();

	const uid = $props.id();
</script>

{#if id === 'telegram'}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 240 240"
		class={cn(size === 'lg' ? 'size-14' : 'size-9', 'shrink-0', className)}
		aria-hidden="true"
	>
		<defs>
			<linearGradient id="{uid}-disc" x1="120" y1="0" x2="60" y2="140" gradientUnits="userSpaceOnUse">
				<stop offset="0" stop-color="#37aee2" />
				<stop offset="1" stop-color="#1e96c8" />
			</linearGradient>
			<linearGradient id="{uid}-plane" x1="129" y1="124" x2="154" y2="164" gradientUnits="userSpaceOnUse">
				<stop offset="0" stop-color="#eff7fc" />
				<stop offset="1" stop-color="#fff" />
			</linearGradient>
		</defs>
		<path fill="url(#{uid}-disc)" d="M240 120c0 66.3-53.7 120-120 120S0 186.3 0 120 53.7 0 120 0s120 53.7 120 120z" />
		<path fill="#c8daea" d="M98 175c-3.9 0-3.2-1.5-4.6-5.2L82 132.2 152.8 88l8.3 2.2-6.9 18.8L98 175z" />
		<path fill="#a9c9dd" d="M98 175c3 0 4.3-1.4 6-3 2.6-2.5 36-35 36-35l-20.5-5-19 12-2.5 30v1z" />
		<path
			fill="url(#{uid}-plane)"
			d="M100 144.4l48.4 35.7c5.5 3 9.5 1.5 10.9-5.1L179 82.2c2-8.1-3.1-11.7-8.4-9.3L55 117.5c-7.9 3.2-7.8 7.6-1.4 9.5l29.7 9.3L152 93c3.2-2 6.2-.9 3.8 1.3L100 144.4z"
		/>
	</svg>
{/if}
