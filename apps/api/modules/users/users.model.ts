import { t } from "elysia";

/**
 * TypeBox schemas for users module input validation.
 */
export const SyncUserBody = t.Object({
  id: t.String(),
  email: t.String(), // Removed format: "email" to be less strict during sync from trusted source
  name: t.Optional(t.Nullable(t.String())),
  oauth_provider: t.Optional(t.Nullable(t.String())),
  profile_picture: t.Optional(t.Nullable(t.String())),
  providers: t.Optional(t.Nullable(t.Any())),
});

export const UpdateAvatarBody = t.Object({
  file: t.File({
    type: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maxSize: "10m",
  }),
});

export const UpdateProfileBody = t.Object({
  name: t.Optional(t.String()),
  profile_picture: t.Optional(t.Nullable(t.String())),
  mobile: t.Optional(t.Nullable(t.String())),
});
