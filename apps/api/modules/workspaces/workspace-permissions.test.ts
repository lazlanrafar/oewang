import { describe, test, expect } from "bun:test";
import {
  normalizeWorkspaceRole,
  canEditWorkspaceData,
  canManageSensitiveWorkspace,
  assertCanEditWorkspaceData,
  assertCanManageSensitiveWorkspace,
} from "./workspace-permissions";

describe("workspace-permissions", () => {
  describe("normalizeWorkspaceRole", () => {
    test('converts "member" to "editor"', () => {
      expect(normalizeWorkspaceRole("member")).toBe("editor");
    });

    test("returns valid roles as-is", () => {
      expect(normalizeWorkspaceRole("owner")).toBe("owner");
      expect(normalizeWorkspaceRole("admin")).toBe("admin");
      expect(normalizeWorkspaceRole("editor")).toBe("editor");
      expect(normalizeWorkspaceRole("viewer")).toBe("viewer");
    });

    test('defaults to "viewer" for invalid roles', () => {
      expect(normalizeWorkspaceRole("invalid")).toBe("viewer");
      expect(normalizeWorkspaceRole("")).toBe("viewer");
      expect(normalizeWorkspaceRole("guest")).toBe("viewer");
    });

    test('defaults to "viewer" for null/undefined', () => {
      expect(normalizeWorkspaceRole(null)).toBe("viewer");
      expect(normalizeWorkspaceRole(undefined)).toBe("viewer");
    });

    test("is case-sensitive", () => {
      expect(normalizeWorkspaceRole("Owner")).toBe("viewer");
      expect(normalizeWorkspaceRole("ADMIN")).toBe("viewer");
      expect(normalizeWorkspaceRole("Editor")).toBe("viewer");
    });
  });

  describe("canEditWorkspaceData", () => {
    test("returns true for owner", () => {
      expect(canEditWorkspaceData("owner")).toBe(true);
    });

    test("returns true for admin", () => {
      expect(canEditWorkspaceData("admin")).toBe(true);
    });

    test("returns true for editor", () => {
      expect(canEditWorkspaceData("editor")).toBe(true);
    });

    test("returns true for member (normalized to editor)", () => {
      expect(canEditWorkspaceData("member")).toBe(true);
    });

    test("returns false for viewer", () => {
      expect(canEditWorkspaceData("viewer")).toBe(false);
    });

    test("returns false for invalid roles", () => {
      expect(canEditWorkspaceData("guest")).toBe(false);
      expect(canEditWorkspaceData("")).toBe(false);
      expect(canEditWorkspaceData("invalid")).toBe(false);
    });

    test("returns false for null/undefined", () => {
      expect(canEditWorkspaceData(null)).toBe(false);
      expect(canEditWorkspaceData(undefined)).toBe(false);
    });
  });

  describe("canManageSensitiveWorkspace", () => {
    test("returns true for owner", () => {
      expect(canManageSensitiveWorkspace("owner")).toBe(true);
    });

    test("returns true for admin", () => {
      expect(canManageSensitiveWorkspace("admin")).toBe(true);
    });

    test("returns false for editor", () => {
      expect(canManageSensitiveWorkspace("editor")).toBe(false);
    });

    test("returns false for member", () => {
      expect(canManageSensitiveWorkspace("member")).toBe(false);
    });

    test("returns false for viewer", () => {
      expect(canManageSensitiveWorkspace("viewer")).toBe(false);
    });

    test("returns false for invalid roles", () => {
      expect(canManageSensitiveWorkspace("moderator")).toBe(false);
      expect(canManageSensitiveWorkspace("")).toBe(false);
    });

    test("returns false for null/undefined", () => {
      expect(canManageSensitiveWorkspace(null)).toBe(false);
      expect(canManageSensitiveWorkspace(undefined)).toBe(false);
    });
  });

  describe("assertCanEditWorkspaceData", () => {
    test("does not throw for owner", () => {
      expect(() => assertCanEditWorkspaceData("owner")).not.toThrow();
    });

    test("does not throw for admin", () => {
      expect(() => assertCanEditWorkspaceData("admin")).not.toThrow();
    });

    test("does not throw for editor", () => {
      expect(() => assertCanEditWorkspaceData("editor")).not.toThrow();
    });

    test("does not throw for member", () => {
      expect(() => assertCanEditWorkspaceData("member")).not.toThrow();
    });

    test("throws 403 for viewer", () => {
      expect(() => assertCanEditWorkspaceData("viewer")).toThrow();
    });

    test("throws 403 for invalid role", () => {
      expect(() => assertCanEditWorkspaceData("invalid")).toThrow();
    });

    test("throws 403 for null", () => {
      expect(() => assertCanEditWorkspaceData(null)).toThrow();
    });

    test("error message includes required permissions", () => {
      try {
        assertCanEditWorkspaceData("viewer");
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        // The error is wrapped in a response object
        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
        expect(errorMessage).toContain("Editor, Admin, or Owner");
      }
    });
  });

  describe("assertCanManageSensitiveWorkspace", () => {
    test("does not throw for owner", () => {
      expect(() => assertCanManageSensitiveWorkspace("owner")).not.toThrow();
    });

    test("does not throw for admin", () => {
      expect(() => assertCanManageSensitiveWorkspace("admin")).not.toThrow();
    });

    test("throws 403 for editor", () => {
      expect(() => assertCanManageSensitiveWorkspace("editor")).toThrow();
    });

    test("throws 403 for viewer", () => {
      expect(() => assertCanManageSensitiveWorkspace("viewer")).toThrow();
    });

    test("throws 403 for member", () => {
      expect(() => assertCanManageSensitiveWorkspace("member")).toThrow();
    });

    test("throws 403 for null", () => {
      expect(() => assertCanManageSensitiveWorkspace(null)).toThrow();
    });

    test("error message includes required permissions", () => {
      try {
        assertCanManageSensitiveWorkspace("editor");
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        // The error is wrapped in a response object
        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
        expect(errorMessage).toContain("Admin or Owner");
      }
    });
  });

  describe("permission hierarchy", () => {
    test("owner has all permissions", () => {
      expect(canEditWorkspaceData("owner")).toBe(true);
      expect(canManageSensitiveWorkspace("owner")).toBe(true);
    });

    test("admin has all permissions", () => {
      expect(canEditWorkspaceData("admin")).toBe(true);
      expect(canManageSensitiveWorkspace("admin")).toBe(true);
    });

    test("editor can edit but not manage sensitive", () => {
      expect(canEditWorkspaceData("editor")).toBe(true);
      expect(canManageSensitiveWorkspace("editor")).toBe(false);
    });

    test("viewer cannot edit or manage", () => {
      expect(canEditWorkspaceData("viewer")).toBe(false);
      expect(canManageSensitiveWorkspace("viewer")).toBe(false);
    });
  });
});
