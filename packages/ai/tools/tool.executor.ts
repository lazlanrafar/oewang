import { log } from "../utils/logger";

export interface ToolServices {
    executeTransactionAction: (name: string, args: any) => Promise<any>;
    executeDebtAction: (name: string, args: any) => Promise<any>;
    executeAnalysisAction: (name: string, args: any) => Promise<any>;
    executeItemsAction: (name: string, args: any) => Promise<any>;
}

export abstract class ToolExecutor {
  static async execute(
    toolName: string,
    args: any,
    services: ToolServices
  ): Promise<any> {
    log.info(`[ToolExecutor] Executing ${toolName}`, args);

    switch (toolName) {
      case "create_transaction":
      case "update_transaction":
      case "delete_transaction":
        return await services.executeTransactionAction(toolName, args);

      case "create_debt":
      case "split_bill":
        return await services.executeDebtAction(toolName, args);

      case "getRevenueSummary":
      case "getBurnRate":
      case "getSpendingAnalysis":
        return await services.executeAnalysisAction(toolName, args);

      case "add_transaction_items":
      case "search_transaction_items":
        return await services.executeItemsAction(toolName, args);

      default:
        throw new Error(`Tool ${toolName} not implemented in ToolExecutor.`);
    }
  }
}
