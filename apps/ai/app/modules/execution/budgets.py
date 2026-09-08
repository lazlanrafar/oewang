"""Budget CRUD — port of BudgetsService.{create,update,delete} (apps/api).
One budget per category (enforced in app code, no DB unique constraint);
category must be an existing expense category; `amount` is the only
editable field post-creation (category is immutable, matching the frontend
form disabling it on edit)."""

from app.core import audit
from app.core.database import fetchrow, transaction
from app.core.ids import new_id
from app.core.serde import row_to_dict


async def create_budget(workspace_id: str, user_id: str, category_id: str, amount: float) -> dict:
    category = await fetchrow(
        "SELECT id, type FROM categories WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        category_id, workspace_id,
    )
    if category is None:
        return {"success": False, "error": "Category not found"}
    if category["type"] != "expense":
        return {"success": False, "error": "Budgets can only be set on expense categories"}

    existing = await fetchrow(
        "SELECT id FROM budgets WHERE category_id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        category_id, workspace_id,
    )
    if existing is not None:
        return {"success": False, "error": "A budget for this category already exists — use update_budget instead"}

    budget_id = new_id()
    async with transaction() as conn:
        row = await conn.fetchrow(
            "INSERT INTO budgets (id, workspace_id, category_id, amount) "
            "VALUES ($1, $2, $3, $4) RETURNING *",
            budget_id, workspace_id, category_id, amount,
        )
        budget = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="budget.created",
            entity="budget", entity_id=budget_id, after=budget, conn=conn,
        )
    return {"success": True, "data": budget}


async def update_budget(workspace_id: str, user_id: str, budget_id: str, amount: float) -> dict:
    before = await fetchrow(
        "SELECT * FROM budgets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        budget_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Budget not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        row = await conn.fetchrow(
            "UPDATE budgets SET amount = $1, updated_at = now() "
            "WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL RETURNING *",
            amount, budget_id, workspace_id,
        )
        updated = row_to_dict(row)
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="budget.updated",
            entity="budget", entity_id=budget_id, before=before, after=updated, conn=conn,
        )
    return {"success": True, "data": updated}


async def delete_budget(workspace_id: str, user_id: str, budget_id: str) -> dict:
    before = await fetchrow(
        "SELECT * FROM budgets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        budget_id, workspace_id,
    )
    if before is None:
        return {"success": False, "error": "Budget not found"}
    before = row_to_dict(before)

    async with transaction() as conn:
        await conn.execute(
            "UPDATE budgets SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
            budget_id, workspace_id,
        )
        await audit.log(
            workspace_id=workspace_id, user_id=user_id, action="budget.deleted",
            entity="budget", entity_id=budget_id, before=before, conn=conn,
        )
    return {"success": True, "data": None}
