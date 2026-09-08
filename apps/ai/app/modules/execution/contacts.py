"""Contact CRUD — port of ContactsService.{create,update,delete}. The
implicit auto-create inside debts.py's `_find_or_create_contact` stays
lenient (never conflicts) — these explicit tools mirror the app's own "Add
Contact" form, which rejects a case-insensitive duplicate name."""

from app.core import audit
from app.core.database import fetch, fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict


async def search_contacts(workspace_id: str, query: str, limit: int = 10) -> dict:
    rows = await fetch(
        "SELECT * FROM contacts WHERE workspace_id = $1 AND deleted_at IS NULL "
        "AND name ILIKE $2 ORDER BY name ASC LIMIT $3",
        workspace_id, f"%{query}%", limit,
    )
    return {"success": True, "data": [dict(r) for r in rows]}


async def _name_taken(workspace_id: str, name: str, exclude_id: str | None = None) -> bool:
    row = await fetchrow(
        "SELECT id FROM contacts WHERE workspace_id = $1 AND lower(name) = lower($2) "
        "AND deleted_at IS NULL AND id != COALESCE($3, '')",
        workspace_id, name, exclude_id,
    )
    return row is not None


async def create_contact(
    workspace_id: str, user_id: str, name: str, email: str | None = None,
    phone: str | None = None, note: str | None = None,
) -> dict:
    if await _name_taken(workspace_id, name):
        return {"success": False, "error": f'A contact named "{name}" already exists'}

    contact_id = new_id()
    async with transaction() as conn:
        row = await conn.fetchrow(
            "INSERT INTO contacts (id, workspace_id, name, email, phone, note) "
            "VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            contact_id, workspace_id, name, email, phone, note,
        )
        contact = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="contact.created",
            entity="contact", entity_id=contact_id, after=contact, conn=conn,
        )
    return {"success": True, "data": contact}


async def update_contact(workspace_id: str, user_id: str, contact_id: str, fields: dict) -> dict:
    before = await fetchrow(
        "SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        contact_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Contact not found"}
    before = row_to_dict(before)

    if fields.get("name") and fields["name"].lower() != before["name"].lower():
        if await _name_taken(workspace_id, fields["name"], exclude_id=contact_id):
            return {"success": False, "error": f'A contact named "{fields["name"]}" already exists'}

    sets, args, i = [], [], 1
    for col in ("name", "email", "phone", "note"):
        if fields.get(col) is None:
            continue
        sets.append(f"{col} = ${i}")
        args.append(fields[col])
        i += 1
    if not sets:
        return {"success": True, "data": before}
    sets.append("updated_at = now()")

    async with transaction() as conn:
        args2 = [*args, contact_id, workspace_id]
        row = await conn.fetchrow(
            f"UPDATE contacts SET {', '.join(sets)} "
            f"WHERE id = ${i} AND workspace_id = ${i + 1} AND deleted_at IS NULL RETURNING *",
            *args2,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="contact.updated",
            entity="contact", entity_id=contact_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def delete_contact(workspace_id: str, user_id: str, contact_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        contact_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Contact not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        await conn.execute(
            "UPDATE contacts SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            contact_id, workspace_id,
        )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="contact.deleted",
            entity="contact", entity_id=contact_id, before=before, conn=conn,
        )
    return {"success": True, "data": None}
