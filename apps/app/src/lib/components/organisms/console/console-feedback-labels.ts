/** The feedback type and status labels, shared by the inbox and its sheet. */
import { t } from '$lib/i18n';
import type { ConsoleFeedback } from '$lib/server/console';

export const FEEDBACK_TYPE_LABEL: Record<ConsoleFeedback['type'], string> = {
	bug: t('settings.feedback_type_bug'),
	feature: t('settings.feedback_type_feature'),
	other: t('settings.feedback_type_other')
};

export const FEEDBACK_STATUS_LABEL: Record<ConsoleFeedback['status'], string> = {
	open: t('console.feedback.status_open'),
	done: t('console.feedback.status_done')
};
