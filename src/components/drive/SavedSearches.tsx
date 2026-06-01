import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteSavedSearch,
  listSavedSearches,
  type SavedSearch,
} from "@/lib/saved-searches";
import type { SearchFilters } from "./SearchBar";

export function SavedSearchesSection({
  userId,
  onApply,
}: {
  userId: string;
  onApply: (query: string, filters: SearchFilters) => void;
}) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["saved-searches", userId],
    queryFn: () => listSavedSearches(userId),
  });

  if (items.length === 0) return null;

  async function handleDelete(e: React.MouseEvent, s: SavedSearch) {
    e.stopPropagation();
    try {
      await deleteSavedSearch(s.id);
      qc.invalidateQueries({ queryKey: ["saved-searches", userId] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="px-3 mt-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">
        Smart folders
      </div>
      <div className="space-y-0.5">
        {items.map((s) => (
          <button
            key={s.id}
            onClick={() => onApply(s.query, s.filters)}
            className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground/80 hover:bg-accent hover:text-foreground text-left"
          >
            <Bookmark className="size-4 shrink-0 text-primary" />
            <span className="truncate flex-1">{s.name}</span>
            <span
              onClick={(e) => handleDelete(e, s)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 rounded"
              title="Remove"
            >
              <X className="size-3" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
