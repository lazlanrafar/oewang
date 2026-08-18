export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
  published: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Public shape returned by /public/faq.
export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

export interface CreateFaqInput {
  question: string;
  answer: string;
  category?: string;
  sort_order?: number;
  published?: boolean;
}

export type UpdateFaqInput = Partial<CreateFaqInput>;

export type FaqStats = {
  total: number;
  published: number;
  draft: number;
};
