import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end gap-4">
          <Skeleton className="h-16 w-[200px]" />
          <Skeleton className="h-16 w-[100px]" />
          <Skeleton className="h-16 w-[100px]" />
          <Skeleton className="h-16 w-[120px]" />
          <Skeleton className="h-9 w-[100px]" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
