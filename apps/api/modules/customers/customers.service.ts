import {
  buildSuccess,
  buildPaginatedSuccess,
  buildError,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { CustomersRepository } from "./customers.repository";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListQueryInput,
} from "./customers.dto";

export abstract class CustomersService {
  static async getAll(workspaceId: string, query: CustomerListQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search;

    const [rows, total] = await Promise.all([
      CustomersRepository.findAll(workspaceId, page, limit, search),
      CustomersRepository.count(workspaceId, search),
    ]);

    return buildPaginatedSuccess(rows, {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    });
  }

  static async getById(id: string, workspaceId: string) {
    const customer = await CustomersRepository.findById(id, workspaceId);
    if (!customer) {
      return buildError(ErrorCode.NOT_FOUND, "Customer not found");
    }
    return buildSuccess(customer);
  }

  static async create(dto: CreateCustomerInput, workspaceId: string) {
    const customer = await CustomersRepository.create({ ...dto, workspaceId });
    return buildSuccess(customer, "Customer created", "CREATED");
  }

  static async update(
    id: string,
    dto: Partial<UpdateCustomerInput>,
    workspaceId: string,
  ) {
    const existing = await CustomersRepository.findById(id, workspaceId);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Customer not found");
    }
    const updated = await CustomersRepository.update(id, workspaceId, dto);
    return buildSuccess(updated);
  }

  static async remove(id: string, workspaceId: string) {
    const existing = await CustomersRepository.findById(id, workspaceId);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Customer not found");
    }
    await CustomersRepository.softDelete(id, workspaceId);
    return buildSuccess(null, "Customer deleted");
  }
}
