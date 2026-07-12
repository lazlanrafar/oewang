import { timingSafeEqual } from "node:crypto";
import { Env } from "@workspace/constants";
import { t } from "elysia";
import { Elysia } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { authPlugin, generateJwt } from "../../plugins/auth";
import { UsersService } from "../users/users.service";
import { WorkspacesService } from "../workspaces/workspaces.service";

export const authController = new Elysia({ prefix: "/auth" })
  .use(authPlugin)

  /**
   * POST /auth/refresh — re-issue JWT with fresh workspace_id from DB.
   * Used after workspace creation to mint a JWT with the new workspace_id.
   */
  .post(
    "/refresh",
    async ({ auth, set }) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      const workspace_id = await UsersService.resolveWorkspaceId(auth.user_id);
      const token = await generateJwt(
        auth.user_id,
        workspace_id,
        auth.email,
        auth.system_role,
      );
      return buildSuccess(
        { token, user_id: auth.user_id, workspace_id: workspace_id || null },
        "Token refreshed",
      );
    },
    { detail: { summary: "Refresh JWT", tags: ["Auth"] } },
  )
  /**
   * POST /auth/login — email + password → app JWT
   */
  .post(
    "/login",
    async ({ body, set }) => {
      const { email, password } = body;

      const user = await UsersService.findByEmail(email);
      if (!user || !user.password_hash) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Invalid email or password");
      }

      const valid = await Bun.password.verify(password, user.password_hash);
      if (!valid) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Invalid email or password");
      }

      const workspace_id = await UsersService.resolveWorkspaceId(user.id);
      if (user.email) {
        await WorkspacesService.acceptInvitation(user.email, user.id);
      }

      const token = await generateJwt(
        user.id,
        workspace_id,
        user.email,
        user.system_role,
      );
      return buildSuccess(
        { token, user_id: user.id, workspace_id: workspace_id || null },
        "Login successful",
      );
    },
    {
      body: t.Object({ email: t.String(), password: t.String() }),
      detail: { summary: "Email/Password Login", tags: ["Auth"] },
    },
  )

  /**
   * POST /auth/register — email + password + name → app JWT
   */
  .post(
    "/register",
    async ({ body, set }) => {
      const { email, password, name } = body;

      const existing = await UsersService.findByEmail(email);
      if (existing) {
        set.status = 409;
        return buildError(
          ErrorCode.VALIDATION_ERROR,
          "An account with this email already exists",
        );
      }

      const password_hash = await Bun.password.hash(password);
      const user = await UsersService.createWithPassword({
        email,
        name,
        password_hash,
      });

      // Auto-accept any pending invitations for this email
      await WorkspacesService.acceptInvitation(email, user.id);

      const workspace_id = await UsersService.resolveWorkspaceId(user.id);
      const token = await generateJwt(
        user.id,
        workspace_id,
        user.email,
        user.system_role,
      );
      return buildSuccess(
        { token, user_id: user.id, workspace_id: workspace_id || null },
        "Registration successful",
      );
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String({ minLength: 8 }),
        name: t.Optional(t.String()),
      }),
      detail: { summary: "Email/Password Register", tags: ["Auth"] },
    },
  )

  /**
   * POST /auth/oauth/connect — OAuth user info from Next.js callback → app JWT
   */
  .post(
    "/oauth/connect",
    async ({ body, headers, set }) => {
      // This endpoint mints a session from a caller-supplied email, so it MUST
      // only be reachable by the trusted Next.js OAuth callback (which has
      // already verified the user with the provider). Gate on a server-to-server
      // shared secret; fail closed when unconfigured. See OAUTH_CONNECT_SECRET.
      const expected = Env.OAUTH_CONNECT_SECRET;
      const provided = headers["x-oauth-connect-secret"];
      const ok =
        !!expected &&
        !!provided &&
        provided.length === expected.length &&
        timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      if (!ok) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      const { provider, provider_user_id, email, name, avatar_url } = body;

      const user = await UsersService.upsertFromOAuth({
        provider,
        provider_user_id,
        email,
        name,
        avatar_url,
      });

      // Auto-accept any pending invitations
      await WorkspacesService.acceptInvitation(email, user.id);

      const workspace_id = await UsersService.resolveWorkspaceId(user.id);
      const token = await generateJwt(
        user.id,
        workspace_id,
        user.email,
        user.system_role,
      );
      return buildSuccess(
        { token, user_id: user.id, workspace_id: workspace_id || null },
        "OAuth connected",
      );
    },
    {
      body: t.Object({
        provider: t.String(),
        provider_user_id: t.String(),
        email: t.String(),
        name: t.Optional(t.String()),
        avatar_url: t.Optional(t.String()),
      }),
      detail: { summary: "OAuth Connect", tags: ["Auth"] },
    },
  );
