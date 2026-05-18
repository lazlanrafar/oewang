import { expect } from 'bun:test';

/**
 * Assert response matches expected JSON shape
 */
export async function expectJSON<T = any>(
  response: Response,
  expected: Partial<T>
): Promise<T> {
  expect(response.ok).toBe(true);
  const data = await response.json();
  expect(data).toMatchObject(expected);
  return data;
}

/**
 * Assert response has validation errors
 */
export async function expectValidationError(
  response: Response,
  field?: string
): Promise<any> {
  expect(response.status).toBe(400);
  const data = await response.json();

  // Check for common error response formats
  const hasErrors =
    data.errors !== undefined ||
    data.error !== undefined ||
    data.message !== undefined;

  expect(hasErrors).toBe(true);

  if (field) {
    const errorMessage = JSON.stringify(data).toLowerCase();
    expect(errorMessage).toContain(field.toLowerCase());
  }

  return data;
}

/**
 * Assert response is unauthorized (401)
 */
export async function expectUnauthorized(response: Response): Promise<any> {
  expect(response.status).toBe(401);
  return response.json().catch(() => ({}));
}

/**
 * Assert response is forbidden (403)
 */
export async function expectForbidden(response: Response): Promise<any> {
  expect(response.status).toBe(403);
  return response.json().catch(() => ({}));
}

/**
 * Assert response is not found (404)
 */
export async function expectNotFound(response: Response): Promise<any> {
  expect(response.status).toBe(404);
  return response.json().catch(() => ({}));
}

/**
 * Assert response is a conflict (409)
 */
export async function expectConflict(response: Response): Promise<any> {
  expect(response.status).toBe(409);
  return response.json().catch(() => ({}));
}

/**
 * Assert response is successful and matches schema
 */
export async function expectSuccess<T = any>(
  response: Response,
  expectedStatus = 200
): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return response.json();
}

/**
 * Assert response contains specific fields
 */
export async function expectFields(
  response: Response,
  fields: string[]
): Promise<any> {
  const data = await response.json();

  for (const field of fields) {
    expect(data).toHaveProperty(field);
  }

  return data;
}

/**
 * Assert array response has expected length
 */
export async function expectArrayLength(
  response: Response,
  length: number
): Promise<any[]> {
  const data = await response.json();
  expect(Array.isArray(data)).toBe(true);
  expect(data).toHaveLength(length);
  return data;
}

/**
 * Assert response is paginated
 */
export async function expectPaginated(response: Response): Promise<any> {
  const data = await response.json();

  expect(data).toHaveProperty('data');
  expect(data).toHaveProperty('meta');
  expect(Array.isArray(data.data)).toBe(true);

  return data;
}
