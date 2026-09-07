import { cn } from "@/lib/cn";

export type DividerProps = {
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function Divider({ orientation = "horizontal", className }: DividerProps) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("h-full w-px self-stretch bg-border", className)}
      />
    );
  }

  return <hr className={cn("w-full border-t border-border", className)} />;
}
