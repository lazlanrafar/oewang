export interface Customer {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  phone?: string | null;
  website?: string | null;
  contact?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip?: string | null;
  note?: string | null;
  vatNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
