import { CategoryForm } from "@/components/organisms/setting/category/category-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Income Categories | Settings",
};

export default async function IncomeCategoryPage() {
  return <CategoryForm type="income" />;
}
