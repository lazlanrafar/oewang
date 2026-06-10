import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <h1 className="mb-4 select-none font-serif text-[120px] text-muted-foreground/10 leading-none sm:text-[180px]">
          404
        </h1>

        <h2 className="mb-4 font-serif text-2xl text-foreground sm:text-3xl">Page not found</h2>

        <p className="mx-auto mb-8 max-w-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="http://localhost:3000">Go to app</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
