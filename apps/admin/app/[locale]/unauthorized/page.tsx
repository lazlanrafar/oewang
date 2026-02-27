import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@workspace/ui";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-4 text-center">
        <ShieldAlert className="size-20 text-red-500 mb-6" />
        <h1 className="text-4xl font-bold mb-4">Unauthorized Access</h1>
        <p className="mt-3 text-lg text-muted-foreground max-w-lg mb-8">
          You do not have the required permissions to access the admin
          dashboard. Please log in with the designated admin account.
        </p>

        <Link href={`/login`}>
          <Button>Return to Login</Button>
        </Link>
      </main>
    </div>
  );
}
