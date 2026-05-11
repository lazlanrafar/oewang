import { redirect } from "next/navigation";

export default async function DocsPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  redirect(`${apiBase}/swagger`);
}
