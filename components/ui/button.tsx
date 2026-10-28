import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "solid"
  | "outline"
  | "ghost"
  | "soft"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush-deep/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50 disabled:pointer-events-none select-none";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-blush text-ink hover:bg-blush-deep shadow-blush hover:shadow-lift",
  solid: "bg-ink text-cream hover:bg-ink/90 shadow-soft",
  outline:
    "border border-copper/40 bg-surface/60 text-ink hover:border-copper/70 hover:bg-blush-soft/50",
  ghost: "text-ink-soft hover:bg-blush-soft/50 hover:text-ink",
  soft: "bg-blush-soft text-blush-deep hover:bg-blush/60 hover:text-ink",
  danger: "bg-[#b86b6b] text-white hover:bg-[#a85d5d] shadow-soft",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(base, variantClasses[variant], sizeClasses[size], className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonVariants({ variant, size, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
