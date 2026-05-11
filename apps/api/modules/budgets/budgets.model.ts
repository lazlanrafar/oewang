import { t } from "elysia";
import { CreateBudgetDto, UpdateBudgetDto } from "@workspace/types";

export const BudgetModel = {
  create: CreateBudgetDto,
  update: UpdateBudgetDto,
  statusQuery: t.Object({
    month: t.Optional(t.Numeric()),
    year: t.Optional(t.Numeric()),
  }),
};
