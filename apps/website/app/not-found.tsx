import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-[120px] sm:text-[180px] leading-none text-muted-foreground/10 select-none mb-4">
          404
        </h1>

        <h2 className="font-serif text-2xl sm:text-3xl text-foreground mb-4">Page not found</h2>

        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
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
