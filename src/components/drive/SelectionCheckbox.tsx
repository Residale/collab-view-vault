import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Subtle hover-revealed checkbox overlay for selecting an item without
 * triggering its primary action. Always rendered when `checked` is true.
 */
export function SelectionCheckbox({
  checked,
  onToggle,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className={cn(
        "size-4 rounded-[5px] grid place-items-center cursor-pointer transition-all shrink-0",
        checked
          ? "bg-primary border border-primary text-primary-foreground opacity-100"
          : "bg-background/80 border border-foreground/40 opacity-60 hover:opacity-100 hover:border-foreground/70 backdrop-blur",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}
