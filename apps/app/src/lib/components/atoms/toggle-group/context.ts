import { getContext, setContext } from 'svelte';

import type { ToggleSize, ToggleVariant } from '../toggle/toggle.svelte';

export type ToggleGroupVariantContext = { variant?: ToggleVariant; size?: ToggleSize };

const key = Symbol('toggle-group');

export function setToggleGroupContext(context: ToggleGroupVariantContext): void {
	setContext(key, context);
}

export function getToggleGroupContext(): ToggleGroupVariantContext {
	return getContext<ToggleGroupVariantContext>(key) ?? {};
}
