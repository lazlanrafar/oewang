import { ShieldAlert } from "lucide-react";
import { Button } from "@workspace/ui";
import { logout } from "@workspace/modules/auth/auth.action";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-4 text-center">
        <ShieldAlert className="size-20 text-red-500 mb-6" />
        <h1 className="text-3xl font-serif mb-1">Unauthorized Access</h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-lg mb-8">
          You do not have the required permissions to access the admin
          dashboard. Please log in with the designated admin account.
        </p>

        <form action={logout}>
          <Button type="submit">Return to Login</Button>
        </form>
      </main>
    </div>
  );
}
