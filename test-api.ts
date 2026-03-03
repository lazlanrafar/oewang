import { getAdminOrders } from "./packages/modules/src/orders/orders.action.ts";
async function run() {
  const result = await getAdminOrders({ page: 1, limit: 10 });
  console.log(JSON.stringify(result, null, 2));
}
run();
