import { DebtsRepository } from "./debts.repository";
import { ContactsRepository } from "../contacts/contacts.repository";
import { TransactionsRepository } from "../transactions/transactions.repository";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import { buildSuccess, buildError } from "@workspace/utils";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { db } from "@workspace/database";
import type { 
  CreateDebtInput, 
  UpdateDebtInput, 
  PayDebtInput,
  BulkPayDebtInput,
  SplitBillInput
} from "./debts.model";

export abstract class DebtsService {
  static async createDebt(
    workspaceId: string,
    userId: string,
    data: CreateDebtInput,
  ) {
    const contact = await ContactsRepository.findById(workspaceId, data.contactId);
    if (!contact) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Contact not found"));
    }

    let origin: "manual" | "from_transaction" = "manual";
    if (data.sourceTransactionId) {
      const tx = await TransactionsRepository.findById(workspaceId, data.sourceTransactionId);
      if (!tx) throw status(404, buildError(ErrorCode.NOT_FOUND, "Source transaction not found"));
      origin = "from_transaction";
    }

    const debt = await DebtsRepository.create({
      workspaceId,
      contactId: data.contactId,
      type: data.type,
      amount: data.amount,
      remainingAmount: data.amount,
      origin,
      sourceTransactionId: data.sourceTransactionId,
      description: data.description,
      dueDate: data.dueDate,
    });

    if (!debt) {
      throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to create debt"));
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "debt.created",
      entity: "debt",
      entity_id: debt.id,
      after: debt,
    });

    return buildSuccess(debt, "Debt created successfully", "CREATED");
  }

  static async updateDebt(
    workspaceId: string,
    userId: string,
    id: string,
    data: UpdateDebtInput,
  ) {
    const debt = await DebtsRepository.findById(workspaceId, id);
    if (!debt) throw status(404, buildError(ErrorCode.NOT_FOUND, "Debt not found"));

    let newAmount = data.amount ? Number(data.amount) : Number(debt.amount);
    let amountDiff = newAmount - Number(debt.amount);
    let newRemaining = Number(debt.remainingAmount) + amountDiff;

    let debtStatus = "unpaid";
    if (newRemaining <= 0) {
      debtStatus = "paid";
      newRemaining = 0;
    } else if (newRemaining < newAmount) {
      debtStatus = "partial";
    }

    const updated = await DebtsRepository.update(id, workspaceId, {
      amount: newAmount,
      remainingAmount: newRemaining,
      status: debtStatus,
      description: data.description,
      dueDate: data.dueDate,
    });

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "debt.updated",
      entity: "debt",
      entity_id: id,
      before: debt,
      after: updated,
    });

    return buildSuccess(updated, "Debt updated successfully");
  }

  static async deleteDebt(workspaceId: string, userId: string, id: string) {
    const debt = await DebtsRepository.findById(workspaceId, id);
    if (!debt) throw status(404, buildError(ErrorCode.NOT_FOUND, "Debt not found"));

    await DebtsRepository.delete(id, workspaceId);

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "debt.deleted",
      entity: "debt",
      entity_id: id,
      before: debt,
    });

    return buildSuccess(null, "Debt deleted successfully");
  }

  static async getDebts(workspaceId: string, contactId?: string) {
    const debts = await DebtsRepository.findMany(workspaceId, contactId);
    return buildSuccess(debts, "Debts retrieved successfully");
  }

  static async payDebt(workspaceId: string, userId: string, id: string, data: PayDebtInput) {
    return await db.transaction(async (tx) => {
      const debt = await DebtsRepository.findById(workspaceId, id);
      if (!debt) throw status(404, buildError(ErrorCode.NOT_FOUND, "Debt not found"));

      const payAmount = Number(data.amount);
      if (payAmount <= 0) throw status(400, buildError(ErrorCode.VALIDATION_ERROR, "Invalid payment amount"));
      if (payAmount > Number(debt.remainingAmount)) {
        throw status(400, buildError(ErrorCode.VALIDATION_ERROR, "Payment amount exceeds remaining debt"));
      }

      let generatedTxId: string | undefined = undefined;
      
      // If payment is made through a wallet
      if (data.walletId) {
        // Debt Payable (you owe them): Settling means Expense for you.
        // Debt Receivable (they owe you): Settling means Income for you.
        const txType = debt.type === "payable" ? "expense" : "income";
        const newTx = await TransactionsRepository.create({
          workspaceId,
          amount: payAmount.toString(),
          date: new Date().toISOString(),
          name: `Debt Settlement: ${debt.description || "Payment"}`,
          type: txType,
          walletId: data.walletId,
          categoryId: null, // Ideally uncategorized, or a 'Transfer' type? Expense/Income is easiest.
          assignedUserId: userId,
        });
        generatedTxId = newTx?.id;
      }

      const payment = await DebtsRepository.addPayment({
        workspaceId,
        debtId: id,
        amount: payAmount,
        transactionId: generatedTxId,
      }, tx);

      const newRemaining = Number(debt.remainingAmount) - payAmount;
      let newStatus = "partial";
      if (newRemaining <= 0) newStatus = "paid";

      const updatedDebt = await DebtsRepository.update(id, workspaceId, {
        remainingAmount: newRemaining,
        status: newStatus,
      }, tx);

      await auditLogsService.log({
        workspace_id: workspaceId,
        user_id: userId,
        action: "debt.paid",
        entity: "debt",
        entity_id: id,
        before: debt,
        after: updatedDebt,
      });

      return buildSuccess(payment, "Payment recorded successfully", "CREATED");
    });
  }

  static async bulkPayDebt(workspaceId: string, userId: string, data: BulkPayDebtInput) {
    return await db.transaction(async (tx) => {
      const debtPaymentsToProcess = [];
      let totalExpense = 0;
      let totalIncome = 0;
      let contactId: string | null = null;
      let count = 0;

      for (const p of data.payments) {
        const debt = await DebtsRepository.findById(workspaceId, p.id);
        if (!debt) throw status(404, buildError(ErrorCode.NOT_FOUND, `Debt not found`));
        if (!contactId) contactId = debt.contactId;

        const payAmount = Number(p.amount);
        if (payAmount <= 0) throw status(400, buildError(ErrorCode.VALIDATION_ERROR, "Invalid payment amount"));
        if (payAmount > Number(debt.remainingAmount)) {
          throw status(400, buildError(ErrorCode.VALIDATION_ERROR, "Payment amount exceeds remaining debt"));
        }

        if (debt.type === "payable") totalExpense += payAmount;
        else totalIncome += payAmount;

        count++;
        debtPaymentsToProcess.push({ debt, payAmount });
      }

      if (debtPaymentsToProcess.length === 0) {
        throw status(400, buildError(ErrorCode.VALIDATION_ERROR, "No payments provided"));
      }

      let contactName = "Multiple";
      if (contactId) {
        const contact = await ContactsRepository.findById(workspaceId, contactId);
        if (contact) contactName = contact.name;
      }

      let generatedExpenseTxId: string | undefined = undefined;
      let generatedIncomeTxId: string | undefined = undefined;

      const descName = count === 1 ? contactName : `${contactName} (Bulk)`;

      if (data.walletId) {
        if (totalExpense > 0) {
          const expenseTx = await TransactionsRepository.create({
            workspaceId,
            amount: totalExpense.toString(),
            date: new Date().toISOString(),
            name: `Debt Settlement: ${descName}`,
            type: "expense",
            walletId: data.walletId,
            categoryId: null,
            assignedUserId: userId,
          });
          generatedExpenseTxId = expenseTx?.id;
        }

        if (totalIncome > 0) {
          const incomeTx = await TransactionsRepository.create({
            workspaceId,
            amount: totalIncome.toString(),
            date: new Date().toISOString(),
            name: `Debt Settlement: ${descName}`,
            type: "income",
            walletId: data.walletId,
            categoryId: null,
            assignedUserId: userId,
          });
          generatedIncomeTxId = incomeTx?.id;
        }
      }

      const recordedPayments = [];

      for (const { debt, payAmount } of debtPaymentsToProcess) {
        const txId = debt.type === "payable" ? generatedExpenseTxId : generatedIncomeTxId;

        const payment = await DebtsRepository.addPayment({
          workspaceId,
          debtId: debt.id,
          amount: payAmount,
          transactionId: txId,
        }, tx);
        recordedPayments.push(payment);

        const newRemaining = Number(debt.remainingAmount) - payAmount;
        let newStatus = "partial";
        if (newRemaining <= 0) newStatus = "paid";

        const updatedDebt = await DebtsRepository.update(debt.id, workspaceId, {
          remainingAmount: newRemaining,
          status: newStatus,
        }, tx);

        await auditLogsService.log({
          workspace_id: workspaceId,
          user_id: userId,
          action: "debt.paid",
          entity: "debt",
          entity_id: debt.id,
          before: debt,
          after: updatedDebt,
        });
      }

      return buildSuccess(recordedPayments, "Bulk payment recorded successfully", "CREATED");
    });
  }

  static async splitBill(workspaceId: string, userId: string, data: SplitBillInput) {
    return await db.transaction(async (tx) => {
      let sourceTxId = data.transactionId;
      const totalAmount = Number(data.amount);

      // Create primary transaction if needed
      if (!sourceTxId && data.walletId) {
        const newTx = await TransactionsRepository.create({
          workspaceId,
          amount: totalAmount.toString(),
          date: new Date().toISOString(),
          name: data.name,
          type: "expense",
          walletId: data.walletId,
          categoryId: data.categoryId || null,
          assignedUserId: userId,
        });
        if (newTx) sourceTxId = newTx.id;
      }

      const numPeople = data.contactNames.length + 1; // + 1 for the user
      const splitAmount = totalAmount / numPeople;
      // Precision handle
      const debtAmount = Number(splitAmount.toFixed(2));

      const createdDebts = [];

      for (const contactName of data.contactNames) {
        // Look for existing contact or create new one
        let contact = await ContactsRepository.findByName(workspaceId, contactName);
        if (!contact) {
            contact = await ContactsRepository.create({
                workspaceId,
                name: contactName,
            });
        }
        if (!contact) continue;

        const debt = await DebtsRepository.create({
          workspaceId,
          contactId: contact.id,
          type: "receivable", // others owe you
          amount: debtAmount,
          remainingAmount: debtAmount,
          origin: sourceTxId ? "from_transaction" : "manual",
          sourceTransactionId: sourceTxId,
          description: `Split for ${data.name}`,
        }, tx);
        
        createdDebts.push(debt);
      }

      await auditLogsService.log({
        workspace_id: workspaceId,
        user_id: userId,
        action: "debt.split_bill",
        entity: "debt",
        entity_id: sourceTxId || "00000000-0000-0000-0000-000000000000",
        after: { sourceTxId, splitAmount, createdDebts },
      });

      return buildSuccess({ sourceTxId, createdDebts }, "Bill split successfully", "CREATED");
    });
  }
}
