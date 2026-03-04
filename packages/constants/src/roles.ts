export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_OPTIONS = [
  { label: "Owner", value: ROLES.OWNER },
  { label: "Admin", value: ROLES.ADMIN },
  { label: "Member", value: ROLES.MEMBER },
] as const;

export const SYSTEM_ROLES = {
  OWNER: "owner",
  FINANCE: "finance",
  USER: "user",
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
