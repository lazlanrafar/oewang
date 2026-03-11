import { CategoryForm } from "@/components/organisms/setting/category/category-form";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ExpenseCategoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dictionary = await getDictionary(locale as Locale);

  return <CategoryForm type="expense" dictionary={dictionary.settings.category.expense} />;
}
