import { createId } from "@paralleldrive/cuid2";
import { faker } from "@faker-js/faker";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type DB = PostgresJsDatabase<any>;

/**
 * Base factory class for creating test data
 * Extend this class for each entity type
 */
export abstract class BaseFactory<T> {
  constructor(protected db: DB) {}

  /**
   * Generate default attributes for the entity
   * Override in subclass
   */
  protected abstract defaultAttributes(): Partial<T>;

  /**
   * Insert entity into database
   * Override in subclass
   */
  protected abstract insert(attributes: Partial<T>): Promise<T>;

  /**
   * Create entity in database with optional overrides
   */
  async create(overrides: Partial<T> = {}): Promise<T> {
    const attributes = {
      ...this.defaultAttributes(),
      ...overrides,
    };

    return this.insert(attributes);
  }

  /**
   * Create multiple entities
   */
  async createMany(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    const promises = Array.from({ length: count }, () =>
      this.create(overrides),
    );
    return Promise.all(promises);
  }

  /**
   * Generate attributes without saving to database
   * Useful for testing validation
   */
  build(overrides: Partial<T> = {}): Partial<T> {
    return {
      ...this.defaultAttributes(),
      ...overrides,
    };
  }

  /**
   * Generate multiple attribute sets without saving
   */
  buildMany(count: number, overrides: Partial<T> = {}): Partial<T>[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  // Utility methods

  /**
   * Generate unique email address
   */
  protected uniqueEmail(): string {
    return `test-${createId().slice(0, 12)}@example.com`;
  }

  /**
   * Generate CUID
   */
  protected generateId(): string {
    return createId();
  }

  /**
   * Generate random past date within days
   */
  protected pastDate(days = 30): Date {
    return faker.date.recent({ days });
  }

  /**
   * Generate random future date within days
   */
  protected futureDate(days = 30): Date {
    return faker.date.soon({ days });
  }
}
