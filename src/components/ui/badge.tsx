import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "default" &&
          "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
        variant === "success" &&
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        variant === "warning" &&
          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
        variant === "danger" &&
          "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
        variant === "muted" &&
          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}
