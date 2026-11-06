<script lang="ts">
	/**
	 * One cell of the loading table, ported from the old app's
	 * `data-table-skeleton-cell.tsx`, class for class: the shape a column's
	 * real content will take, so the rows do not jump when it arrives.
	 */
	import { Skeleton } from '../../atoms/skeleton/index.js';
	import { cn } from '$lib/utils.js';

	import type { SkeletonType } from './data-table-types.js';

	let { type = 'text', width = 'w-24' }: { type?: SkeletonType; width?: string } = $props();
</script>

{#if type === 'checkbox'}
	<Skeleton class="h-4 w-4" />
{:else if type === 'avatar-text'}
	<div class="flex items-center space-x-2">
		<Skeleton class="h-6 w-6 shrink-0 rounded-full" />
		<Skeleton class={cn('h-3.5', width)} />
	</div>
{:else if type === 'icon-text'}
	<div class="flex items-center space-x-2">
		<Skeleton class="h-[9px] w-[9px] shrink-0" />
		<Skeleton class={cn('h-3.5', width)} />
	</div>
{:else if type === 'badge'}
	<Skeleton class={cn('h-5', width)} />
{:else if type === 'tags'}
	<div class="flex items-center space-x-1">
		<Skeleton class="h-5 w-12" />
		<Skeleton class="h-5 w-16" />
	</div>
{:else if type === 'icon'}
	<Skeleton class="h-5 w-5" />
{:else}
	<Skeleton class={cn('h-3.5', width)} />
{/if}
