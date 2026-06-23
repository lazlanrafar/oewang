import { describe, expect, test } from "bun:test";
import {
  pickActiveWorkspaceId,
  resolveWorkspaceIdFromBody,
} from "./users.utils";

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

describe("pickActiveWorkspaceId", () => {
  test("should keep the stored workspace when it is an active membership", () => {
    expect(pickActiveWorkspaceId("ws_a", ["ws_a", "ws_b"])).toBe("ws_a");
  });

  test("should fall back to the first active membership when stored is stale", () => {
    // The poisoned-token case: users.workspace_id points to a workspace the
    // user is no longer a member of — must not be embedded in the JWT.
    expect(pickActiveWorkspaceId("ws_stale", ["ws_b"])).toBe("ws_b");
  });

  test("should return empty string when the user has no active memberships", () => {
    expect(pickActiveWorkspaceId("ws_stale", [])).toBe("");
    expect(pickActiveWorkspaceId(null, [])).toBe("");
    expect(pickActiveWorkspaceId(undefined, [])).toBe("");
  });
});
