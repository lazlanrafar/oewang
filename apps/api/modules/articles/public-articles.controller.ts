import { Elysia } from "elysia";
import { ArticlesService } from "./articles.service";

export const publicArticlesController = new Elysia({
  prefix: "/public/articles",
  name: "public-articles.controller",
})
  .get(
    "/",
    async () => {
      return ArticlesService.getPublicList();
    },
    {
      detail: {
        summary: "List Public Articles",
        description:
          "Returns published articles (excerpt only) without authentication",
        tags: ["Public"],
      },
    },
  )
  .get(
    "/:slug",
    async ({ params: { slug } }) => {
      return ArticlesService.getPublicBySlug(slug);
    },
    {
      detail: {
        summary: "Get Public Article",
        description: "Returns one published article by slug",
        tags: ["Public"],
      },
    },
  );
