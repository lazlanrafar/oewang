import { t, type UnwrapSchema } from "elysia";

export const BudgetDto = t.Object({
  id: t.String(),
  workspaceId: t.String(),
  categoryId: t.String(),
  amount: t.String(),
  period: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
  deletedAt: t.Optional(t.Nullable(t.String())),
});

export const CreateBudgetDto = t.Object({
  categoryId: t.String({ minLength: 1 }),
  amount: t.Number({ minimum: 0 }),
});

export const UpdateBudgetDto = t.Partial(t.Object({
  amount: t.Number({ minimum: 0 }),
}));

export const BudgetStatusDto = t.Object({
  id: t.String(),
  categoryId: t.String(),
  categoryName: t.String(),
  amount: t.Number(),
  spent: t.Number(),
  percentage: t.Number(),
});

export type Budget = UnwrapSchema<typeof BudgetDto>;
export type CreateBudgetInput = UnwrapSchema<typeof CreateBudgetDto>;
export type UpdateBudgetInput = UnwrapSchema<typeof UpdateBudgetDto>;
export type BudgetStatus = UnwrapSchema<typeof BudgetStatusDto>;
