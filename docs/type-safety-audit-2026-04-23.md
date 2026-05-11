# Type Safety Audit (any/unknown) - April 23, 2026

## Scope
Scanned source TypeScript files in:
- `apps/*`
- `packages/*`

Excluded generated/vendor paths:
- `node_modules`, `.next`, `dist`, `build`, `coverage`, `*.d.ts`

Pattern used (typed usage only):
- `: any`, `as any`, `<any>`, `any[]`
- `: unknown`, `as unknown`, `<unknown>`

## Snapshot
- Initial typed hits: **539**
- Current typed hits after this pass: **459**
- Net reduction this pass: **80**

## Highest-Impact Hotspots (current)
1. `apps/app/components/organisms/invoices/invoice-form-sheet.tsx` (23)
2. `apps/api/__tests__/production_readiness.test.ts` (20)
3. `apps/api/modules/ai/ai.tools.ts` (19)
4. `packages/modules/src/ai/ai.action.ts` (16)
5. `apps/api/modules/workspaces/workspaces.controller.ts` (16)
6. `packages/modules/src/transaction/transaction.action.ts` (14)
7. `packages/modules/src/workspace/workspace.action.ts` (13)
8. `packages/modules/src/invoice/invoice.action.ts` (12)
9. `packages/modules/src/setting/setting.action.ts` (11)
10. `apps/api/modules/transactions/transactions.repository.ts` (11)
11. `apps/api/modules/debts/debts.repository.ts` (11)
12. `packages/modules/src/user/user.action.ts` (10)
13. `packages/modules/src/budget/budget.action.ts` (10)
14. `apps/api/modules/users/users.controller.ts` (10)

## What was improved in this pass
- Added reusable filter types in `packages/types`:
  - `FilterRecord`, `FilterValue`, `PrimitiveFilterValue`
- Reworked `apps/app/hooks/use-data-table-filter.ts` to remove `unknown` usage and use typed pagination updater.
- Reworked `packages/ui/src/components/organisms/data-table-filter/data-table-filter.tsx` to remove `any`, introduce strict filter typing helpers, and avoid unsafe casts.
- Reworked `packages/ui/src/components/atoms/icons.tsx` icon props from `any` to typed SVG props.

## Recommended next batches
1. **Invoices UI batch**
   - `apps/app/components/organisms/invoices/invoice-form-sheet.tsx`
   - Replace broad casts with explicit invoice form DTO types in `packages/types/invoice.ts`.
2. **Modules action layer batch**
   - `packages/modules/src/{transaction,workspace,invoice,setting,user,budget}/*.action.ts`
   - Standardize on typed API envelope decoding helpers and typed error extractor.
3. **API controller/repository batch**
   - `apps/api/modules/{workspaces,users,transactions,debts}/*`
   - Replace `ctx: any` and row casts with route/request DTO types and DB row mappers.
4. **AI tooling batch**
   - `apps/api/modules/ai/ai.tools.ts`
   - Introduce typed tool input/output contracts in `packages/types/ai-tools.ts`.

## Validation note
Targeted typechecks were run for touched files in `apps/app` and `packages/ui` and passed for those paths.
