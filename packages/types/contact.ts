export interface Contact {
  id: string;
  workspaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  website?: string | null;
  note?: string | null;
  vatNumber?: string | null;
  billingEmails?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
