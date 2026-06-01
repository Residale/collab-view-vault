import { Download, Move, Share2, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SelectionBar({
  fileCount,
  folderCount,
  onClear,
  onMove,
  onDownload,
  onDelete,
  onStar,
  onShare,
}: {
  fileCount: number;
  folderCount: number;
  onClear: () => void;
  onMove: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onStar: () => void;
  onShare: () => void;
}) {
  const total = fileCount + folderCount;
  if (total === 0) return null;
  const label = [
    fileCount ? `${fileCount} file${fileCount > 1 ? "s" : ""}` : "",
    folderCount ? `${folderCount} folder${folderCount > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full bg-background/95 backdrop-blur ring-1 ring-hairline shadow-pane px-2 py-1.5 animate-in fade-in slide-in-from-bottom-2">
      <button
        onClick={onClear}
        className="size-8 grid place-items-center rounded-full hover:bg-surface-2 text-muted-foreground hover:text-foreground"
        title="Clear selection (Esc)"
      >
        <X className="size-4" />
      </button>
      <span className="px-2 text-sm font-medium tabular-nums whitespace-nowrap">{label}</span>
      <div className="w-px h-6 bg-hairline mx-1" />
      <ActionButton icon={<Move className="size-4" />} label="Move" onClick={onMove} disabled={total === 0} />
      <ActionButton icon={<Download className="size-4" />} label="Download" onClick={onDownload} disabled={fileCount === 0} />
      <ActionButton icon={<Share2 className="size-4" />} label="Share" onClick={onShare} disabled={total !== 1} />
      <ActionButton icon={<Star className="size-4" />} label="Star" onClick={onStar} disabled={fileCount === 0} />
      <div className="w-px h-6 bg-hairline mx-1" />
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        className="h-8 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-4" />
        Delete
      </Button>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
