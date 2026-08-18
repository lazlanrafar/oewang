export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
  published: boolean;
  published_at: Date | null;
  author_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Public list shape (excerpt only — no body) returned by /public/articles.
export interface PublicArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  published_at: Date | null;
  created_at: Date;
}

export interface CreateArticleInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  cover_image?: string;
  published?: boolean;
}

export type UpdateArticleInput = Partial<CreateArticleInput>;

export type ArticleStats = {
  total: number;
  published: number;
  draft: number;
};
