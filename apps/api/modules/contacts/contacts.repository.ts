import {
  db,
  eq,
  and,
  desc,
  isNull,
  contacts,
  sql,
  ilike,
} from "@workspace/database";
import type { Contact } from "@workspace/types";

export abstract class ContactsRepository {
  static async create(data: {
    workspaceId: string;
    name: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
    website?: string;
    note?: string;
    vatNumber?: string;
    billingEmails?: string;
  }): Promise<Contact | null> {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact
      ? ({
          ...contact,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          deletedAt: contact.deletedAt,
        } as unknown as Contact)
      : null;
  }

  static async update(
    id: string,
    workspaceId: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      state: string;
      country: string;
      zip: string;
      website: string;
      note: string;
      vatNumber: string;
      billingEmails: string;
    }>,
  ): Promise<Contact | null> {
    const [contact] = await db
      .update(contacts)
      .set({ ...data, updatedAt: sql`now()` })
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();
    return contact
      ? ({
          ...contact,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          deletedAt: contact.deletedAt,
        } as unknown as Contact)
      : null;
  }

  static async delete(
    id: string,
    workspaceId: string,
  ): Promise<Contact | null> {
    const [contact] = await db
      .update(contacts)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
        ),
      )
      .returning();
    return contact as unknown as Contact;
  }

  static async findMany(
    workspaceId: string,
    search?: string,
  ): Promise<Contact[]> {
    const conditions = [
      eq(contacts.workspaceId, workspaceId),
      isNull(contacts.deletedAt),
    ];

    if (search) {
      conditions.push(ilike(contacts.name, `%${search}%`));
    }

    const results = await db
      .select()
      .from(contacts)
      .where(and(...conditions))
      .orderBy(desc(contacts.createdAt));

    return results as unknown as Contact[];
  }

  static async findById(
    workspaceId: string,
    id: string,
  ): Promise<Contact | null> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);

    return contact ? (contact as unknown as Contact) : null;
  }

  static async findByName(
    workspaceId: string,
    name: string,
  ): Promise<Contact | null> {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(
          ilike(contacts.name, name),
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);

    return contact ? (contact as unknown as Contact) : null;
  }
}
