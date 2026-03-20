import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          {
            default:
              "bg-foreground text-background hover:bg-foreground/90",
            secondary:
              "bg-foreground/10 text-foreground hover:bg-foreground/15",
            outline:
              "border border-foreground/20 bg-transparent hover:bg-foreground/5",
            ghost: "hover:bg-foreground/5",
          }[variant],
          {
            default: "h-10 px-4 py-2 text-sm rounded-md",
            sm: "h-8 px-3 text-xs rounded-md",
            lg: "h-12 px-6 text-base rounded-md",
          }[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
