import { describe, expect, test } from "bun:test";
import { TestClient } from "../helpers";

describe("Health Check", () => {
  const client = new TestClient();

  test("GET /health returns OK status", async () => {
    const response = await client.get("/health");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("ok");
  });

  test("API is accessible", async () => {
    const response = await client.get("/");
    expect(response.status).toBeLessThan(500);
  });
});
