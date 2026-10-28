import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

/** Puntito de color para acompañar un estado dentro de un badge. */
export function Dot({ className }: { className?: string }) {
  return (
    <span className={cn("h-1.5 w-1.5 rounded-full", className)} aria-hidden />
  );
}
