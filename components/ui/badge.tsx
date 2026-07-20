import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-1 py-0 text-2xs font-medium uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-terminal-border text-foreground",
        success: "border-gap-complete/40 bg-gap-complete/15 text-gap-complete",
        warning:
          "border-gap-extrapolated/40 bg-gap-extrapolated/15 text-gap-extrapolated",
        danger:
          "border-gap-incomplete/40 bg-gap-incomplete/15 text-gap-incomplete",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
