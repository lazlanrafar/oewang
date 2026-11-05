<script lang="ts">
	/** Every atom in `$lib/components/atoms`, expanded. */
	import Bell from '@lucide/svelte/icons/bell';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Bold from '@lucide/svelte/icons/bold';
	import Italic from '@lucide/svelte/icons/italic';
	import Underline from '@lucide/svelte/icons/underline';
	import Plus from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';

	import { Logo } from '$lib/components/atoms/logo';
	import * as Accordion from '$lib/components/atoms/accordion';
	import * as Alert from '$lib/components/atoms/alert';
	import { AspectRatio } from '$lib/components/atoms/aspect-ratio';
	import * as AlertDialog from '$lib/components/atoms/alert-dialog';
	import * as Avatar from '$lib/components/atoms/avatar';
	import { Badge } from '$lib/components/atoms/badge';
	import * as Breadcrumb from '$lib/components/atoms/breadcrumb';
	import { Button } from '$lib/components/atoms/button';
	import { Calendar } from '$lib/components/atoms/calendar';
	import * as Card from '$lib/components/atoms/card';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import * as Collapsible from '$lib/components/atoms/collapsible';
	import * as Command from '$lib/components/atoms/command';
	import * as Dialog from '$lib/components/atoms/dialog';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { Input } from '$lib/components/atoms/input';
	import { Kbd, KbdGroup } from '$lib/components/atoms/kbd';
	import { Label } from '$lib/components/atoms/label';
	import { NativeSelect } from '$lib/components/atoms/native-select';
	import { Pagination } from '$lib/components/atoms/pagination';
	import * as Popover from '$lib/components/atoms/popover';
	import { Progress } from '$lib/components/atoms/progress';
	import * as RadioGroup from '$lib/components/atoms/radio-group';
	import { RangeCalendar } from '$lib/components/atoms/range-calendar';
	import { ScrollArea } from '$lib/components/atoms/scroll-area';
	import * as Select from '$lib/components/atoms/select';
	import { Separator } from '$lib/components/atoms/separator';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Skeleton } from '$lib/components/atoms/skeleton';
	import { Slider } from '$lib/components/atoms/slider';
	import { Spinner } from '$lib/components/atoms/spinner';
	import { Switch } from '$lib/components/atoms/switch';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { Toggle } from '$lib/components/atoms/toggle';
	import * as ToggleGroup from '$lib/components/atoms/toggle-group';
	import * as Tooltip from '$lib/components/atoms/tooltip';
	import Specimen from '../specimen.svelte';


	const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Salary'];
	let category = $state('Food');
	let switched = $state(true);
	let radio = $state('weekly');
	let slider = $state([40]);
	let page = $state(2);
	let bold = $state(true);
	let formatting = $state<string[]>(['bold']);
	let showArchived = $state(true);
</script>

<Specimen
	title="Logo"
	note="The Oewang mark from the old app's Icons.Logo, path for path. It draws in currentColor, so it follows the text colour in light and dark; a caller only sizes it. Decorative unless given a label."
>
	<div class="flex items-end gap-6">
		<Logo class="size-6" />
		<Logo />
		<Logo class="size-12" label="Oewang" />
	</div>
</Specimen>

<Specimen title="Button">
	<div class="flex flex-wrap items-center gap-2">
		<Button id="spec-button">Default</Button>
		<Button variant="secondary">Secondary</Button>
		<Button variant="outline">Outline</Button>
		<Button variant="ghost">Ghost</Button>
		<Button variant="destructive">Destructive</Button>
		<Button variant="ghost-destructive">Ghost destructive</Button>
		<Button variant="link">Link</Button>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<Button size="sm">Small</Button>
		<Button size="default">Default</Button>
		<Button size="lg">Large</Button>
		<Button size="icon" aria-label="Add"><Plus /></Button>
		<Button loading>Loading</Button>
		<Button disabled>Disabled</Button>
		<Button href="#top">As a link</Button>
	</div>
</Specimen>

<Specimen title="Badge">
	<div class="flex flex-wrap items-center gap-2">
		<Badge>Default</Badge>
		<Badge variant="secondary">Secondary</Badge>
		<Badge variant="outline">Outline</Badge>
		<Badge variant="destructive">Destructive</Badge>
		<Badge variant="success">Installed</Badge>
		<Badge variant="muted">Not set up</Badge>
		<Badge variant="ghost">Ghost</Badge>
		<Badge variant="link" href="#top">Link</Badge>
	</div>
</Specimen>

<Specimen title="Input, label, textarea"
	note="Square, a plain border, and no focus treatment: the old app suppresses it globally.">
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<Label id="spec-label" for="spec-input">Input</Label>
			<Input id="spec-input" placeholder="Placeholder" />
		</div>
		<div class="space-y-2">
			<Label for="spec-input-value">With a value</Label>
			<Input id="spec-input-value" value="A sample description" />
		</div>
		<div class="space-y-2">
			<Label for="spec-input-disabled">Disabled</Label>
			<Input id="spec-input-disabled" disabled placeholder="Disabled" />
		</div>
		<div class="space-y-2">
			<Label for="spec-input-invalid">Invalid</Label>
			<Input id="spec-input-invalid" aria-invalid="true" value="not-an-email" />
			<p class="text-destructive text-small">Enter an email address.</p>
		</div>
		<div class="space-y-2 sm:col-span-2">
			<Label for="spec-textarea">Textarea</Label>
			<Textarea id="spec-textarea" placeholder="A note on this transaction" rows={3} />
		</div>
	</div>
</Specimen>

<Specimen title="Checkbox, radio, switch">
	<div class="flex flex-wrap items-start gap-10">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox" />
				<Label for="spec-checkbox">Unchecked</Label>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox-on" checked />
				<Label for="spec-checkbox-on">Checked</Label>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox-mixed" indeterminate />
				<Label for="spec-checkbox-mixed">Indeterminate</Label>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox-off" disabled />
				<Label for="spec-checkbox-off">Disabled</Label>
			</div>
		</div>

		<RadioGroup.Root bind:value={radio}>
			{#each [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']] as [value, label] (value)}
				<div class="flex items-center gap-2">
					<RadioGroup.Item {value} id="radio-{value}" />
					<Label for="radio-{value}">{label}</Label>
				</div>
			{/each}
		</RadioGroup.Root>

		<div class="space-y-3">
			<div class="flex items-center gap-2">
				<Switch id="spec-switch" bind:checked={switched} />
				<Label for="spec-switch">Email receipts</Label>
			</div>
			<div class="flex items-center gap-2">
				<Switch id="spec-switch-off" disabled />
				<Label for="spec-switch-off">Disabled</Label>
			</div>
		</div>
	</div>
</Specimen>

<Specimen
	title="Native select"
	note="The plain control a form keeps for the path where script has not run: the rich select is a button, and a button submits nothing. Same height and border as the input, and the class string lives here rather than in each form that needs one."
>
	<NativeSelect id="spec-native-select" class="max-w-xs">
		<option value="expense">Expense</option>
		<option value="income">Income</option>
		<option value="transfer">Transfer</option>
	</NativeSelect>
</Specimen>

<Specimen
	title="Select primitive"
	note="The bits-ui control the molecule wraps. A feature uses `molecules/select`; this is what it is made of."
>
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="space-y-2">
			<Label for="spec-select">Select</Label>
			<Select.Root type="single" bind:value={category}>
				<Select.Trigger id="spec-select" class="w-full">{category}</Select.Trigger>
				<Select.Content>
					{#each categories as option (option)}
						<Select.Item value={option}>{option}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<div class="space-y-2">
			<Label for="spec-select-disabled">Disabled</Label>
			<Select.Root type="single" disabled value="Food">
				<Select.Trigger id="spec-select-disabled" class="w-full">Food</Select.Trigger>
				<Select.Content />
			</Select.Root>
		</div>
	</div>
</Specimen>

<Specimen title="Avatar, skeleton, spinner, progress, slider">
	<div class="flex flex-wrap items-center gap-8">
		<div class="flex items-center gap-3">
			<Avatar.Root size="sm"><Avatar.Fallback>AZ</Avatar.Fallback></Avatar.Root>
			<Avatar.Root><Avatar.Fallback>BW</Avatar.Fallback></Avatar.Root>
		</div>
		<div class="space-y-2">
			<Skeleton class="h-4 w-40" />
			<Skeleton class="h-4 w-28" />
		</div>
		<Spinner />
		<div class="w-48 space-y-2">
			<Progress value={62} />
			<Slider type="multiple" bind:value={slider} max={100} step={1} />
		</div>
	</div>
</Specimen>

<Specimen title="Alert">
	<div class="space-y-3">
		<Alert.Root>
			<Bell class="size-4" />
			<Alert.Title>Receipt attached</Alert.Title>
			<Alert.Description>The scan is stored with this transaction.</Alert.Description>
		</Alert.Root>
		<Alert.Root variant="destructive">
			<CircleAlert class="size-4" />
			<Alert.Title>Wallet balance would go negative</Alert.Title>
			<Alert.Description>Lower the amount or pick another wallet.</Alert.Description>
		</Alert.Root>
		<Alert.Root variant="warning">
			<CircleAlert class="size-4" />
			<Alert.Title>Two rows have no category</Alert.Title>
			<Alert.Description>They import, but they will not appear in a breakdown.</Alert.Description>
		</Alert.Root>
	</div>
</Specimen>

<Specimen title="Accordion and collapsible">
	<div class="grid gap-6 sm:grid-cols-2">
		<Accordion.Root type="single">
			<Accordion.Item value="one">
				<Accordion.Trigger>How are balances computed?</Accordion.Trigger>
				<Accordion.Content>
					From the transactions themselves, by the API, inside the same transaction that
					writes the row.
				</Accordion.Content>
			</Accordion.Item>
			<Accordion.Item value="two">
				<Accordion.Trigger>Can a deleted row come back?</Accordion.Trigger>
				<Accordion.Content>Yes. Deletes are soft, so nothing is lost.</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>

		<Collapsible.Root class="space-y-2">
			<Collapsible.Trigger class="text-body flex items-center gap-2 font-medium">
				Advanced filters
			</Collapsible.Trigger>
			<Collapsible.Content class="text-subtle text-body space-y-1">
				<p>Amount between</p>
				<p>Only uncategorised</p>
			</Collapsible.Content>
		</Collapsible.Root>
	</div>
</Specimen>

<Specimen title="Toggle, tabs, breadcrumb, pagination, kbd">
	<div class="flex flex-wrap items-center gap-6">
		<Toggle bind:pressed={bold} aria-label="Bold"><Bold /></Toggle>
		<ToggleGroup.Root type="multiple" bind:value={formatting} variant="outline">
			<ToggleGroup.Item value="bold" aria-label="Bold"><Bold /></ToggleGroup.Item>
			<ToggleGroup.Item value="italic" aria-label="Italic"><Italic /></ToggleGroup.Item>
			<ToggleGroup.Item value="underline" aria-label="Underline"><Underline /></ToggleGroup.Item>
		</ToggleGroup.Root>
		<KbdGroup>
			<Kbd>Cmd</Kbd>
			<Kbd>K</Kbd>
		</KbdGroup>
	</div>

	<div class="grid gap-6 sm:grid-cols-2">
		<Tabs.Root value="default">
			<Tabs.List>
				<Tabs.Trigger value="default">Default</Tabs.Trigger>
				<Tabs.Trigger value="other">Other</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="default" class="text-body">The filled list variant.</Tabs.Content>
			<Tabs.Content value="other" class="text-body">Second panel.</Tabs.Content>
		</Tabs.Root>

		<Tabs.Root value="week">
			<Tabs.List variant="segmented">
				<Tabs.Trigger value="week" variant="segmented">Week</Tabs.Trigger>
				<Tabs.Trigger value="month" variant="segmented">Month</Tabs.Trigger>
				<Tabs.Trigger value="year" variant="segmented">Year</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="week" class="text-body">The segmented variant.</Tabs.Content>
			<Tabs.Content value="month" class="text-body">November.</Tabs.Content>
			<Tabs.Content value="year" class="text-body">2026.</Tabs.Content>
		</Tabs.Root>

		<Tabs.Root value="all">
			<Tabs.List variant="segmented">
				<Tabs.Trigger value="all" variant="segmented">All apps</Tabs.Trigger>
				<Tabs.Trigger value="connected" variant="segmented">Connected</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="all" class="text-body">The same segmented variant, as the Apps page uses it.</Tabs.Content>
			<Tabs.Content value="connected" class="text-body">Only connected apps.</Tabs.Content>
		</Tabs.Root>
	</div>

	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item><Breadcrumb.Link href="#top">Workspace</Breadcrumb.Link></Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item>
				<Breadcrumb.Link href="#top">Transactions</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Item><Breadcrumb.Page>A sample row</Breadcrumb.Page></Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<Pagination count={120} perPage={20} bind:page />
</Specimen>

<Specimen title="Separator, scroll area, tooltip">
	<Separator />
	<div class="text-body flex h-8 items-center gap-3">
		<span>Transactions</span>
		<Separator orientation="vertical" class="h-4" />
		<span>Chat</span>
		<Separator orientation="vertical" class="h-4" />
		<span>Settings</span>
	</div>
	<div class="flex flex-wrap items-start gap-6">
		<ScrollArea class="h-28 w-56 border p-3">
			<div class="text-body space-y-2">
				{#each categories as option (option)}
					<p>{option}</p>
				{/each}
				<p>Groceries</p>
				<p>Rent</p>
				<p>Utilities</p>
			</div>
		</ScrollArea>
		<Tooltip.Provider>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Hover me</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Exports the rows you have selected</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	</div>
</Specimen>

<Specimen title="Command"
	note="The list the combobox opens, inline so its own styling is visible."
	framed={false}
>
	<Command.Root class="max-w-sm border">
		<Command.Input placeholder="Search categories..." />
		<Command.List>
			<Command.Empty>No match.</Command.Empty>
			<Command.Group heading="Categories">
				{#each categories as option (option)}
					<Command.Item value={option}>
						<Check class="size-4 {option === category ? 'opacity-100' : 'opacity-0'}" />
						{option}
					</Command.Item>
				{/each}
			</Command.Group>
			<Command.Separator />
			<Command.Group heading="Actions">
				<Command.Item value="new">
					<Plus class="size-4" />
					New category
					<Command.Shortcut>Cmd N</Command.Shortcut>
				</Command.Item>
			</Command.Group>
		</Command.List>
	</Command.Root>
</Specimen>

<Specimen title="Menus and overlays"
	note="Square surfaces, a 1px rule, no shadow. The two menu rows in the table below measure once the dropdown has been opened.">
	<div class="flex flex-wrap items-center gap-2">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Dropdown menu</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-52" align="start">
				<DropdownMenu.Label>This row</DropdownMenu.Label>
				<DropdownMenu.Group>
					<DropdownMenu.Item>
						Edit
						<DropdownMenu.Shortcut>Cmd E</DropdownMenu.Shortcut>
					</DropdownMenu.Item>
					<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
					<DropdownMenu.CheckboxItem bind:checked={showArchived}>
						Show archived
					</DropdownMenu.CheckboxItem>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger>Move to</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent>
						{#each categories as option (option)}
							<DropdownMenu.Item>{option}</DropdownMenu.Item>
						{/each}
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="text-destructive">Delete</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Popover</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-64" align="start">
				<p class="text-body">A popover holds anything: a form, a filter, a date range.</p>
			</Popover.Content>
		</Popover.Root>

		<Dialog.Root>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Dialog</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-md">
				<Dialog.Header>
					<Dialog.Title>Edit transaction</Dialog.Title>
					<Dialog.Description>A dialog is for a task, not a question.</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button>Save</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<AlertDialog.Root>
			<AlertDialog.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Alert dialog</Button>
				{/snippet}
			</AlertDialog.Trigger>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>Delete this transaction?</AlertDialog.Title>
					<AlertDialog.Description>
						It is removed from the list and the wallet balance is recomputed. Deletes are
						soft, so it can be restored.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Cancel</Button>
						{/snippet}
					</AlertDialog.Cancel>
					<AlertDialog.Action>
						{#snippet child({ props })}
							<Button variant="destructive" {...props}>Delete</Button>
						{/snippet}
					</AlertDialog.Action>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>

		<Sheet.Root>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Sheet</Button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="right">
				<Sheet.Header>
					<Sheet.Title>New transaction</Sheet.Title>
					<Sheet.Description>The form the transactions page opens.</Sheet.Description>
				</Sheet.Header>
				<div class="space-y-4 px-4">
					<div class="space-y-2">
						<Label for="sheet-name">Description</Label>
						<Input id="sheet-name" placeholder="What the money was for" />
					</div>
				</div>
				<Sheet.Footer>
					<Button>Save</Button>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet.Root>

		<Button variant="outline" onclick={() => toast.success('Transaction saved')}>Toast</Button>
		<Button variant="outline" onclick={() => toast.error('Wallet balance would go negative')}>
			Toast, error
		</Button>
	</div>
</Specimen>

<Specimen title="Card"
	note="Flat: a rule, no radius, no shadow, and the page background rather than a raised surface.">
	<div class="grid gap-4 sm:grid-cols-2">
		<Card.Root id="spec-card">
			<Card.Header>
				<Card.Title>This month</Card.Title>
				<Card.Description>1 to 30 November 2026</Card.Description>
				<Card.Action><Button variant="ghost" size="sm">Export</Button></Card.Action>
			</Card.Header>
			<Card.Content>
				<p class="text-h1 font-mono">Rp 9.388.500</p>
				<p class="text-green text-small mt-1 font-mono">+Rp 9.500.000 in, -Rp 111.500 out</p>
			</Card.Content>
			<Card.Footer>Updated 2 minutes ago</Card.Footer>
		</Card.Root>

		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Wallets</Card.Title>
				<Card.Description>Three wallets, one currency each.</Card.Description>
			</Card.Header>
			<Card.Content class="text-body pt-6">
				<ul class="space-y-2">
					<li class="flex justify-between"><span>Petty cash</span><span class="font-mono">Rp 412.000</span></li>
					<li class="flex justify-between"><span>Current account</span><span class="font-mono">Rp 8.976.500</span></li>
					<li class="flex justify-between"><span>Travel card</span><span class="font-mono">$120,10</span></li>
				</ul>
			</Card.Content>
			<Card.Footer class="gap-2">
				<Button size="sm" variant="outline">Add wallet</Button>
			</Card.Footer>
		</Card.Root>
	</div>
</Specimen>

<Specimen title="Calendar and range calendar"
	note="One month for a single day, two for a range. A day is 32px, the selected day inverts, and the days between the ends of a range are tinted rather than outlined (D52). The value is a `DateValue`, never a `Date`: a transaction happens on a calendar day in the workspace’s zone.">
	<div class="flex flex-wrap items-start gap-6">
		<div class="border p-3"><Calendar type="single" /></div>
		<div class="border p-3"><RangeCalendar /></div>
	</div>
</Specimen>

<Specimen title="Aspect ratio"
	note="Holds a box at a ratio while whatever goes in it loads, so a receipt preview does not resize the page under the pointer when the bytes arrive."
	framed={false}
>
	<div class="w-64 border">
		<AspectRatio ratio={4 / 3}>
			<div class="text-subtle text-small flex h-full w-full items-center justify-center">4 : 3</div>
		</AspectRatio>
	</div>
</Specimen>
