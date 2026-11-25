<script lang="ts">
	/** A workspace's status: deleted wins over suspended, otherwise active (US-082). */
	import { Badge, type BadgeVariant } from '$lib/components/atoms/badge';
	import { workspaceStatus, type WorkspaceStatus } from '$lib/console';
	import { t } from '$lib/i18n';

	let { workspace }: { workspace: { deleted_at: string | null; suspended_at: string | null } } = $props();

	const LOOK: Record<WorkspaceStatus, { variant: BadgeVariant; label: string }> = {
		active: { variant: 'outline', label: t('console.workspaces.status_active') },
		suspended: { variant: 'secondary', label: t('console.workspaces.status_suspended') },
		deleted: { variant: 'destructive', label: t('console.workspaces.status_deleted') }
	};

	const look = $derived(LOOK[workspaceStatus(workspace)]);
</script>

<Badge variant={look.variant}>{look.label}</Badge>
