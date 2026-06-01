import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchDrive } from "@/lib/drive-search.functions";
import type { SearchFilters } from "./SearchBar";
import { FileIcon } from "./FileIcon";
import { Thumbnail } from "./Thumbnail";
import { Star, X, Bookmark } from "lucide-react";
import { FolderIcon } from "@/components/drive/FolderIcon";
import { formatBytes, type FileRow, type FolderRow } from "@/lib/drive-api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createSavedSearch } from "@/lib/saved-searches";
import { supabase } from "@/integrations/supabase/client";

function rangeToISO(r: SearchFilters["modifiedRange"]) {
  if (r === "any") return undefined;
  const day = 86_400_000;
  const map = { today: day, "7d": 7 * day, "30d": 30 * day, year: 365 * day } as const;
  return new Date(Date.now() - map[r]).toISOString();
}
function rangeToSize(r: SearchFilters["sizeRange"]): { min?: number; max?: number } {
  const MB = 1024 * 1024;
  switch (r) {
    case "lt1mb": return { max: MB };
    case "1to10": return { min: MB, max: 10 * MB };
    case "10to100": return { min: 10 * MB, max: 100 * MB };
    case "gt100": return { min: 100 * MB };
    default: return {};
  }
}

export function SearchResults({
  query,
  filters,
  onOpenFile,
  onOpenFolder,
  onClear,
}: {
  query: string;
  filters: SearchFilters;
  onOpenFile: (f: FileRow) => void;
  onOpenFolder: (f: FolderRow) => void;
  onClear: () => void;
}) {
  const after = rangeToISO(filters.modifiedRange);
  const { min, max } = rangeToSize(filters.sizeRange);

  const { data, isLoading } = useQuery({
    queryKey: ["drive-search-full", query, filters],
    queryFn: () =>
      searchDrive({
        data: {
          q: query,
          types: filters.types.length ? filters.types : undefined,
          modifiedAfter: after,
          sizeMin: min,
          sizeMax: max,
          starred: filters.starred || undefined,
          limit: 100,
        },
      }),
    enabled: query.length > 0,
  });

  const total = (data?.files.length ?? 0) + (data?.folders.length ?? 0);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Search results</div>
          <h1 className="text-2xl font-semibold mt-1">
            {isLoading ? "Searching…" : `${total} result${total === 1 ? "" : "s"} for "${query}"`}
          </h1>
          <ActiveChips filters={filters} />
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" /> Clear search
        </button>
      </div>

      {data && data.folders.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Folders</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onOpenFolder(f as FolderRow)}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 hover:bg-accent text-left ring-1 ring-hairline transition-colors"
              >
                <FolderIcon color={(f as any).color} className="size-5" />
                <span className="truncate text-sm">{f.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {data && data.files.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Files</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {data.files.map((f) => (
              <button
                key={f.id}
                onClick={() => onOpenFile(f as FileRow)}
                className="group flex flex-col gap-2 text-left"
              >
                <div className="aspect-square rounded-lg bg-surface-2 ring-1 ring-hairline overflow-hidden grid place-items-center group-hover:ring-primary/30 transition-all">
                  <Thumbnail file={f as FileRow} className="size-20" iconClassName="size-8" />
                </div>
                <div className="px-1">
                  <div className="flex items-center gap-1.5">
                    <FileIcon name={f.name} mime={f.mime_type} className="size-3.5 shrink-0" />
                    <span className="text-xs truncate flex-1">{f.name}</span>
                    {f.starred && <Star className="size-3 fill-current text-amber-500 shrink-0" />}
                  </div>
                  {f.snippet && (
                    <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{f.snippet}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(f.size)}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isLoading && total === 0 && (
        <div className="text-center text-sm text-muted-foreground mt-20">
          No files or folders match this search.
        </div>
      )}
    </div>
  );
}

function ActiveChips({ filters }: { filters: SearchFilters }) {
  const chips: string[] = [];
  if (filters.types.length) chips.push(filters.types.join(", "));
  if (filters.modifiedRange !== "any") chips.push(filters.modifiedRange);
  if (filters.sizeRange !== "any") chips.push(filters.sizeRange);
  if (filters.starred) chips.push("starred");
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map((c) => (
        <span key={c} className={cn("text-[10px] px-2 py-0.5 rounded-full bg-surface-2 ring-1 ring-hairline text-muted-foreground")}>{c}</span>
      ))}
    </div>
  );
}
