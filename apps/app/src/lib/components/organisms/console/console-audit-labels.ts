/** How an audit entry's action and entity read, shared by the audit table and its sheet. */
import { auditActionLabel } from '$lib/console';
import { t } from '$lib/i18n';

const ENTITY: Record<string, string> = {
	user: t('console.audit.entities.user'),
	workspace: t('console.audit.entities.workspace'),
	feedback: t('console.audit.entities.feedback'),
	console_role: t('console.audit.entities.console_role')
};

/** An action this build does not know shows as its key rather than as nothing. */
export function actionName(action: string): string {
	const key = auditActionLabel(action);
	return key ? t(key) : action;
}

export const entityName = (entity: string) => ENTITY[entity] ?? entity;

/** "17 Nov 2026, 14:05", in the reader's zone: the moment it happened. */
export const whenLabel = (iso: string) =>
	new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
