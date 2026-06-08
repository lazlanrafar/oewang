import { describe, expect, test } from "bun:test";
import { resolveWorkspaceIdFromBody } from "./users.utils";

describe("users.utils", () => {
  test("should return workspaceId when camelCase key exists", () => {
    const result = resolveWorkspaceIdFromBody({
      workspaceId: "ws_camel",
      workspace_id: "ws_snake",
    });

    expect(result).toBe("ws_camel");
  });

  test("should return workspace_id when camelCase key is missing", () => {
    const result = resolveWorkspaceIdFromBody({
      workspace_id: "ws_snake",
    });

    expect(result).toBe("ws_snake");
  });

  test("should trim whitespace and return null for empty values", () => {
    const result = resolveWorkspaceIdFromBody({
      workspaceId: "   ",
      workspace_id: "\n",
    });

    expect(result).toBeNull();
  });
});
