export interface Notification {
  id: string;
  user_id: string;
  workspace_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string | Date;
  deleted_at: string | Date | null;
}

export interface InsertNotification {
  id?: string;
  user_id: string;
  workspace_id: string;
  type: string;
  title: string;
  message: string;
  is_read?: boolean;
  link?: string | null;
  created_at?: Date;
  deleted_at?: Date | null;
}

export interface NotificationSetting {
  id: string;
  user_id: string;
  workspace_id: string;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  marketing_enabled: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
}

export interface InsertNotificationSetting {
  id?: string;
  user_id: string;
  workspace_id: string;
  email_enabled?: boolean;
  whatsapp_enabled?: boolean;
  push_enabled?: boolean;
  marketing_enabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}
