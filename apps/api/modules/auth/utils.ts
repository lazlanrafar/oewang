import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import type { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";

export const isAuthenticated = (app: Elysia) =>
  app
    .use(authPlugin)
    .onBeforeHandle(({ auth, set }) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
    })
    .derive(({ auth }) => {
      return { user: auth! };
    });
