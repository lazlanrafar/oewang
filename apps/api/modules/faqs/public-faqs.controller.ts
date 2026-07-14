import { Elysia } from "elysia";
import { FaqsService } from "./faqs.service";

export const publicFaqsController = new Elysia({
  prefix: "/public/faq",
  name: "public-faqs.controller",
}).get(
  "/",
  async () => {
    return FaqsService.getPublicFaqs();
  },
  {
    detail: {
      summary: "Get Public FAQs",
      description: "Returns all published FAQs without authentication",
      tags: ["Public"],
    },
  },
);
