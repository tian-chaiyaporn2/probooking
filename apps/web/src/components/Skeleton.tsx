import type { HTMLAttributes } from "react";

type SkeletonVariant = "block" | "line" | "line-short" | "avatar" | "chip" | "stat";

const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  block: "skeleton",
  line: "skeleton skeleton--line",
  "line-short": "skeleton skeleton--line skeleton--line-short",
  avatar: "skeleton skeleton--avatar",
  chip: "skeleton skeleton--chip",
  stat: "stat skeleton",
};

/** Loading placeholder matching clinical-trust skeleton styles. */
export function Skeleton({
  variant = "block",
  className,
  ...rest
}: {
  variant?: SkeletonVariant;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={[VARIANT_CLASS[variant], className].filter(Boolean).join(" ")}
      aria-hidden
      {...rest}
    />
  );
}

/** Convenience row of stat-tile skeletons for dashboard grids. */
export function StatSkeletonGrid({ count, testid }: { count: number; testid?: string }) {
  return (
    <div className="stat-grid" data-testid={testid} aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="stat" />
      ))}
    </div>
  );
}
