import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Skeleton - Loading placeholder component
 *
 * Used to prevent jarring content pops during async operations.
 * Follows Calm Technology principles (subtle pulse, muted colors).
 *
 * @example
 * // Card skeleton
 * <Card>
 *   <CardHeader><Skeleton className="h-5 w-3/4" /></CardHeader>
 *   <CardContent className="space-y-3">
 *     <Skeleton className="h-4 w-full" />
 *     <Skeleton className="h-4 w-2/3" />
 *   </CardContent>
 * </Card>
 *
 * @example
 * // Message skeleton
 * <div className="flex gap-3">
 *   <Skeleton className="h-8 w-8 rounded-full" />
 *   <div className="flex-1 space-y-2">
 *     <Skeleton className="h-4 w-1/4" />
 *     <Skeleton className="h-4 w-full" />
 *     <Skeleton className="h-4 w-5/6" />
 *   </div>
 * </div>
 */
const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(({ className, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('animate-pulse rounded-md bg-muted/50', className)} {...props} />
  );
});
Skeleton.displayName = 'Skeleton';

export { Skeleton };
