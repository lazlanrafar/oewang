import type { Metadata } from "next";

import { CategoryForm } from "@/components/organisms/setting/category/category-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = {
  title: "Expense Categories | Settings",
};

export default async function ExpenseCategoryPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const dictionary = await getDictionary((await params).locale);
  return <CategoryForm type="expense" dictionary={dictionary} />;
}
