// Client-side entry point for modules
// This file exports the browser-safe axios instance AND the server actions.
// Next.js will handle the "use server" directives and create the necessary RPC stubs.

export { axiosInstance } from "./lib/axios.client";

export * from "./ai/ai.action";
export * from "./auth/auth.action";
export * from "./category/category.action";
export * from "./import/import.action";
export * from "./integrations/integrations.action";
export * from "./metrics/metrics.action";
export * from "./setting/setting.action";
export * from "./system-admin/system-admin.action";
export * from "./transaction/transaction.action";
export * from "./user/user.action";
export * from "./vault/vault.action";
export * from "./wallet/wallet.action";
export * from "./wallet-group/wallet-group.action";
export * from "./workspace/workspace.action";
export * from "./pricing/pricing.action";
export * from "./stripe/stripe.action";
export * from "./orders/orders.action";
export * from "./customer/customer.action";
