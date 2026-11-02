<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
	import { Button, buttonVariants } from '../button/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	/*
	 * Ported from the old app's atoms/pagination.tsx, which is a nav of
	 * ghost-button links either side of the page numbers.
	 */
	let {
		ref = $bindable(null),
		page = $bindable(1),
		class: className,
		count,
		perPage = 10,
		siblingCount = 1,
		...restProps
	}: WithoutChildrenOrChild<PaginationPrimitive.RootProps> = $props();
</script>

<PaginationPrimitive.Root
	bind:ref
	bind:page
	{count}
	{perPage}
	{siblingCount}
	data-slot="pagination"
	class={cn('mx-auto flex w-full justify-center', className)}
	{...restProps}
>
	{#snippet children({ pages, currentPage })}
		<div class="flex flex-row items-center gap-1">
			<PaginationPrimitive.PrevButton>
				{#snippet child({ props })}
					<Button variant="ghost" size="sm" class="gap-1 px-2.5" {...props}>
						<ChevronLeft />
						<span class="hidden sm:block">Previous</span>
					</Button>
				{/snippet}
			</PaginationPrimitive.PrevButton>

			{#each pages as page (page.key)}
				{#if page.type === 'ellipsis'}
					<span data-slot="pagination-ellipsis" class="flex size-9 items-center justify-center">
						&hellip;
					</span>
				{:else}
					<PaginationPrimitive.Page {page}>
						{#snippet child({ props })}
							<a
								class={buttonVariants({
									variant: currentPage === page.value ? 'outline' : 'ghost',
									size: 'icon'
								})}
								href="#{page.value}"
								{...props}
							>
								{page.value}
							</a>
						{/snippet}
					</PaginationPrimitive.Page>
				{/if}
			{/each}

			<PaginationPrimitive.NextButton>
				{#snippet child({ props })}
					<Button variant="ghost" size="sm" class="gap-1 px-2.5" {...props}>
						<span class="hidden sm:block">Next</span>
						<ChevronRight />
					</Button>
				{/snippet}
			</PaginationPrimitive.NextButton>
		</div>
	{/snippet}
</PaginationPrimitive.Root>
