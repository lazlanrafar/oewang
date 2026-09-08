"""create_category — used only as a get-or-create side effect of
create_transaction when the model names a category that doesn't match any
existing one (see resolvers.resolve_or_create_category_id)."""

from app.core import audit
from app.core.database import transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict


async def create_category(workspace_id: str, user_id: str, name: str, type_: str) -> dict:
    category_id = new_id()
    async with transaction() as conn:
        row = await conn.fetchrow(
            "INSERT INTO categories (id, workspace_id, name, type) "
            "VALUES ($1, $2, $3, $4) RETURNING *",
            category_id,
            workspace_id,
            name,
            type_,
        )
        category = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="category.created",
            entity="category", entity_id=category_id, before=None, after=category, conn=conn,
        )
    return category
