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
      detail: { summary: "List Pricing Plans", tags: ["Pricing"] },
    },
  )
  .get(
    "/:id",
    async ({ params: { id } }) => {
      return PricingService.getById(id);
    },
    { detail: { summary: "Get Pricing Plan Details", tags: ["Pricing"] } },
  )
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
      detail: { summary: "Create Pricing Plan", tags: ["Pricing"] },
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
      detail: { summary: "Update Pricing Plan", tags: ["Pricing"] },
    },
  )
  .delete(
    "/:id",
    async ({ params: { id }, auth }) => {
      // @ts-ignore
      return PricingService.softDelete(id, auth?.user_id || "system");
    },
    { detail: { summary: "Delete Pricing Plan", tags: ["Pricing"] } },
  );
