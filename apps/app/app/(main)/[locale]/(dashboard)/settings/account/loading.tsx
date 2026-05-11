import { Card, CardContent, CardHeader, Separator, Skeleton } from "@workspace/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-2 h-7 w-[150px]" />
        <Skeleton className="h-4 w-[300px]" />
      </div>
      <Separator />
      <Card>
        <CardHeader>
          <Skeleton className="mb-2 h-5 w-[200px]" />
          <Skeleton className="h-4 w-[350px]" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </div>
              </div>
              <Skeleton className="h-8 w-[100px]" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
