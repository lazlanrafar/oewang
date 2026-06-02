import type { Elysia } from "elysia";

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * Test client for making HTTP requests to the API
 * Can work with either a real server or an Elysia app instance
 */
export class TestClient {
  private baseURL = "http://localhost:3002";
  private defaultHeaders: Record<string, string> = {};

  constructor(private app?: Elysia) {}

  /**
   * Set authorization token for subsequent requests
   */
  withAuth(token: string): TestClient {
    this.defaultHeaders["Authorization"] = `Bearer ${token}`;
    return this;
  }

  /**
   * Clear all default headers
   */
  clearAuth(): TestClient {
    delete this.defaultHeaders["Authorization"];
    return this;
  }

  /**
   * GET request
   */
  async get(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildURL(path, options.query);
    const headers = { ...this.defaultHeaders, ...options.headers };

    if (this.app) {
      return this.app.handle(
        new Request(url, {
          method: "GET",
          headers,
        }),
      );
    }

    return fetch(url, { method: "GET", headers });
  }

  /**
   * POST request
   */
  async post(
    path: string,
    body?: any,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = this.buildURL(path, options.query);
    const headers = {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (this.app) {
      return this.app.handle(
        new Request(url, {
          method: "POST",
          headers,
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    }

    return fetch(url, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch(
    path: string,
    body?: any,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = this.buildURL(path, options.query);
    const headers = {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (this.app) {
      return this.app.handle(
        new Request(url, {
          method: "PATCH",
          headers,
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    }

    return fetch(url, {
      method: "PATCH",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put(
    path: string,
    body?: any,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = this.buildURL(path, options.query);
    const headers = {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
      ...options.headers,
    };

    if (this.app) {
      return this.app.handle(
        new Request(url, {
          method: "PUT",
          headers,
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    }

    return fetch(url, {
      method: "PUT",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildURL(path, options.query);
    const headers = { ...this.defaultHeaders, ...options.headers };

    if (this.app) {
      return this.app.handle(
        new Request(url, {
          method: "DELETE",
          headers,
        }),
      );
    }

    return fetch(url, { method: "DELETE", headers });
  }

  /**
   * Helper to build URL with query parameters
   */
  private buildURL(path: string, query?: Record<string, string>): string {
    const url = new URL(path, this.baseURL);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }

  /**
   * Extract JSON from response
   */
  static async json<T = any>(response: Response): Promise<T> {
    return response.json();
  }

  /**
   * Assert response is successful (2xx)
   */
  static expectSuccess(response: Response): Response {
    if (!response.ok) {
      throw new Error(
        `Expected successful response, got ${response.status}: ${response.statusText}`,
      );
    }
    return response;
  }

  /**
   * Assert response has specific status
   */
  static expectStatus(response: Response, status: number): Response {
    if (response.status !== status) {
      throw new Error(
        `Expected status ${status}, got ${response.status}: ${response.statusText}`,
      );
    }
    return response;
  }
}

/**
 * Create authenticated test client by logging in
 */
export async function createAuthenticatedClient(
  email: string,
  password: string,
): Promise<TestClient> {
  const client = new TestClient();

  const response = await client.post("/auth/login", {
    email,
    password,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to authenticate: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const token = data.access_token || data.token;

  if (!token) {
    throw new Error("No token returned from login endpoint");
  }

  return client.withAuth(token);
}
