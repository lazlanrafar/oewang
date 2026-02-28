import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { requireAdminAccess } from "../system-admins/system-admins.controller";

import {
  CreatePricingDto,
  PricingListQuery,
  UpdatePricingDto,
} from "./pricing.dto";
import { PricingService } from "./pricing.service";

export const pricingController = new Elysia({
  prefix: "/pricing",
  name: "pricing.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ query }) => {
      return PricingService.getAll(query);
    },
    {
      query: PricingListQuery,
    },
  )
  .get("/:id", async ({ params: { id } }) => {
    return PricingService.getById(id);
  })
  // Protect mutations via admin access (owner or finance)
  .use(requireAdminAccess)
  .post(
    "/",
    async ({ body, auth }) => {
      // @ts-ignore
      return PricingService.create(body, auth?.user_id || "system");
    },
    {
      body: CreatePricingDto,
    },
  )
  .patch(
    "/:id",
    async ({ params: { id }, body, auth }) => {
      // @ts-ignore
      return PricingService.update(id, body, auth?.user_id || "system");
    },
    {
      body: UpdatePricingDto,
    },
  )
  .delete("/:id", async ({ params: { id }, auth }) => {
    // @ts-ignore
    return PricingService.softDelete(id, auth?.user_id || "system");
  });
