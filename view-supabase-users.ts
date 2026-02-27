import { createAdminClient } from "./packages/supabase/client/admin";

async function main() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Supabase Error:", error);
    process.exit(1);
  }
  console.log(
    data.users.map((u) => ({ id: u.id, email: u.email, meta: u.app_metadata })),
  );
  process.exit(0);
}

main().catch(console.error);
