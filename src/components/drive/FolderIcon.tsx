import { cn } from "@/lib/utils";

/**
 * Mac-style filled folder icon. Default color = macOS blue.
 * Renders as a two-tone SVG: darker back tab + lighter front body,
 * with subtle highlight for depth. The `color` prop should be a CSS
 * color (hex/rgb/oklch). The component derives back/front shades.
 */
export const DEFAULT_FOLDER_COLOR = "#3B82F6"; // macOS-ish blue

export const FOLDER_PALETTE: { name: string; value: string }[] = [
  { name: "Blue",   value: "#3B82F6" },
  { name: "Cyan",   value: "#06B6D4" },
  { name: "Teal",   value: "#14B8A6" },
  { name: "Green",  value: "#22C55E" },
  { name: "Lime",   value: "#84CC16" },
  { name: "Yellow", value: "#EAB308" },
  { name: "Orange", value: "#F97316" },
  { name: "Red",    value: "#EF4444" },
  { name: "Pink",   value: "#EC4899" },
  { name: "Purple", value: "#A855F7" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Slate",  value: "#64748B" },
  { name: "Stone",  value: "#78716C" },
  { name: "Graphite", value: "#374151" },
];

export function FolderIcon({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  const base = color || DEFAULT_FOLDER_COLOR;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5 shrink-0", className)}
      aria-hidden="true"
    >
      {/* Back tab — slightly darker */}
      <path
        d="M2.5 6.25 A1.75 1.75 0 0 1 4.25 4.5 H9.5 L11.25 6.25 H19.75 A1.75 1.75 0 0 1 21.5 8 V8.75 H2.5 Z"
        fill={base}
        opacity="0.78"
      />
      {/* Front body — main color */}
      <path
        d="M2.5 8.25 A1.75 1.75 0 0 1 4.25 6.5 H19.75 A1.75 1.75 0 0 1 21.5 8.25 V17.75 A1.75 1.75 0 0 1 19.75 19.5 H4.25 A1.75 1.75 0 0 1 2.5 17.75 Z"
        fill={base}
      />
      {/* Top highlight — subtle gloss */}
      <path
        d="M2.5 8.25 A1.75 1.75 0 0 1 4.25 6.5 H19.75 A1.75 1.75 0 0 1 21.5 8.25 V9.25 H2.5 Z"
        fill="white"
        opacity="0.18"
      />
    </svg>
  );
}
