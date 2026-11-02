import Content from './tabs-content.svelte';
import List from './tabs-list.svelte';
import Trigger from './tabs-trigger.svelte';
import Root from './tabs.svelte';

export {
	Root,
	Content,
	List,
	Trigger,
	Root as Tabs,
	Content as TabsContent,
	List as TabsList,
	Trigger as TabsTrigger
};
export { tabsListVariants, type TabsListVariant } from './tabs-list.svelte';
export { tabsTriggerVariants, type TabsTriggerVariant } from './tabs-trigger.svelte';
