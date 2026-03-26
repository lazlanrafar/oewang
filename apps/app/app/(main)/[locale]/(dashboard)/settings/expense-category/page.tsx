import { CategoryForm } from "@/components/organisms/setting/category/category-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Expense Categories | Settings",
};

export default async function ExpenseCategoryPage() {
  return <CategoryForm type="expense" />;
}
