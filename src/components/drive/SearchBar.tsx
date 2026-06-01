import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Filter, Clock, FileType2, Calendar, HardDrive, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchDrive, getRecentSearches, recordSearch, type DriveSearchResult } from "@/lib/drive-search.functions";
import { FileIcon } from "./FileIcon";
import { Folder } from "lucide-react";
import type { FileRow, FolderRow } from "@/lib/drive-api";

export type SearchFilters = {
  types: Array<"image" | "video" | "audio" | "pdf" | "doc" | "spreadsheet" | "code" | "archive" | "other">;
  modifiedRange: "any" | "today" | "7d" | "30d" | "year";
  sizeRange: "any" | "lt1mb" | "1to10" | "10to100" | "gt100";
  starred: boolean;
};

const DEFAULT_FILTERS: SearchFilters = {
  types: [],
  modifiedRange: "any",
  sizeRange: "any",
  starred: false,
};

const TYPE_OPTIONS: Array<{ k: SearchFilters["types"][number]; label: string }> = [
  { k: "image", label: "Images" },
  { k: "video", label: "Videos" },
  { k: "audio", label: "Audio" },
  { k: "pdf", label: "PDF" },
  { k: "doc", label: "Documents" },
  { k: "spreadsheet", label: "Spreadsheets" },
  { k: "code", label: "Code" },
  { k: "archive", label: "Archives" },
];

function rangeToISO(r: SearchFilters["modifiedRange"]): { after?: string } {
  if (r === "any") return {};
  const now = Date.now();
  const day = 86_400_000;
  const map = { today: day, "7d": 7 * day, "30d": 30 * day, year: 365 * day } as const;
  return { after: new Date(now - map[r]).toISOString() };
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

export function SearchBar({
  onOpenFile,
  onOpenFolder,
  onActiveQueryChange,
}: {
  onOpenFile: (f: FileRow) => void;
  onOpenFolder: (f: FolderRow) => void;
  onActiveQueryChange: (q: string, filters: SearchFilters) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  // Auto-clear active search results when the input is emptied — no Enter needed.
  const lastSubmittedRef = useRef<string>("");
  useEffect(() => {
    if (q.trim() === "" && lastSubmittedRef.current !== "") {
      lastSubmittedRef.current = "";
      onActiveQueryChange("", filters);
    }
  }, [q, filters, onActiveQueryChange]);

  // Keyboard: ⌘K / Ctrl+K to focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQ("");
        inputRef.current?.blur();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtersPayload = useMemo(() => {
    const { after } = rangeToISO(filters.modifiedRange);
    const { min, max } = rangeToSize(filters.sizeRange);
    return {
      types: filters.types.length ? filters.types : undefined,
      modifiedAfter: after,
      sizeMin: min,
      sizeMax: max,
      starred: filters.starred || undefined,
    };
  }, [filters]);

  // Live suggestions query
  const { data: suggestions, isFetching } = useQuery({
    queryKey: ["drive-search", debounced, filtersPayload],
    queryFn: () =>
      searchDrive({ data: { q: debounced, ...filtersPayload, limit: 8 } }),
    enabled: open && debounced.length > 0,
    staleTime: 30_000,
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["drive-search-recent"],
    queryFn: () => getRecentSearches(),
    enabled: open && debounced.length === 0,
    staleTime: 60_000,
  });

  const activeFilterCount =
    filters.types.length +
    (filters.modifiedRange !== "any" ? 1 : 0) +
    (filters.sizeRange !== "any" ? 1 : 0) +
    (filters.starred ? 1 : 0);

  function submit(query: string) {
    if (!query.trim()) return;
    lastSubmittedRef.current = query.trim();
    recordSearch({ data: { query: query.trim() } }).catch(() => {});
    onActiveQueryChange(query.trim(), filters);
    setOpen(false);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <div className="flex items-center gap-2 h-10 px-3 bg-surface-2 ring-1 ring-hairline rounded-full focus-within:ring-primary/40 focus-within:bg-background transition-colors">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(q); }}
          placeholder="Search files, content, people…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        {q && (
          <button onClick={() => { setQ(""); inputRef.current?.focus(); }} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "h-7 px-2 rounded-full flex items-center gap-1 text-xs ring-1 ring-hairline transition-colors",
                activeFilterCount > 0 ? "bg-primary text-primary-foreground ring-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Filter className="size-3" />
              Filters {activeFilterCount > 0 && <span>· {activeFilterCount}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-4 space-y-4">
            <FilterSection icon={<FileType2 className="size-3.5" />} label="Type">
              <div className="flex flex-wrap gap-1.5">
                {TYPE_OPTIONS.map((t) => {
                  const active = filters.types.includes(t.k);
                  return (
                    <button
                      key={t.k}
                      onClick={() =>
                        setFilters((s) => ({
                          ...s,
                          types: active ? s.types.filter((x) => x !== t.k) : [...s.types, t.k],
                        }))
                      }
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full ring-1 transition-colors",
                        active ? "bg-primary text-primary-foreground ring-primary" : "bg-surface-2 ring-hairline hover:bg-accent",
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection icon={<Calendar className="size-3.5" />} label="Modified">
              <Chips
                value={filters.modifiedRange}
                onChange={(v) => setFilters((s) => ({ ...s, modifiedRange: v as any }))}
                options={[
                  { v: "any", l: "Any time" },
                  { v: "today", l: "Today" },
                  { v: "7d", l: "Last 7d" },
                  { v: "30d", l: "Last 30d" },
                  { v: "year", l: "This year" },
                ]}
              />
            </FilterSection>

            <FilterSection icon={<HardDrive className="size-3.5" />} label="Size">
              <Chips
                value={filters.sizeRange}
                onChange={(v) => setFilters((s) => ({ ...s, sizeRange: v as any }))}
                options={[
                  { v: "any", l: "Any" },
                  { v: "lt1mb", l: "<1 MB" },
                  { v: "1to10", l: "1–10 MB" },
                  { v: "10to100", l: "10–100 MB" },
                  { v: "gt100", l: ">100 MB" },
                ]}
              />
            </FilterSection>

            <FilterSection icon={<Star className="size-3.5" />} label="Other">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.starred}
                  onChange={(e) => setFilters((s) => ({ ...s, starred: e.target.checked }))}
                />
                Starred only
              </label>
            </FilterSection>

            <div className="flex justify-between pt-2 border-t border-hairline">
              <Button size="sm" variant="ghost" onClick={clearFilters}>Reset</Button>
              <Button size="sm" onClick={() => submit(q || "*")}>Apply</Button>
            </div>
          </PopoverContent>
        </Popover>
        <kbd className="hidden md:inline-flex text-[10px] font-mono px-1.5 py-0.5 rounded ring-1 ring-hairline text-muted-foreground">⌘K</kbd>
      </div>

      {open && (
        <div className="absolute top-12 left-0 right-0 bg-popover border border-hairline rounded-xl shadow-pane overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {debounced.length === 0 ? (
            <div className="p-2">
              {recent.length > 0 ? (
                <>
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Recent searches</div>
                  {recent.map((r) => (
                    <button
                      key={r.query + r.created_at}
                      onClick={() => { setQ(r.query); submit(r.query); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-sm text-left"
                    >
                      <Clock className="size-3.5 text-muted-foreground" />
                      <span>{r.query}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Start typing to search files and content
                </div>
              )}
            </div>
          ) : (
            <SuggestionList
              data={suggestions}
              loading={isFetching}
              query={debounced}
              onOpenFile={(f) => { onOpenFile(f as FileRow); setOpen(false); }}
              onOpenFolder={(f) => { onOpenFolder(f as FolderRow); setOpen(false); }}
              onSeeAll={() => submit(q)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full ring-1 transition-colors",
            value === o.v ? "bg-primary text-primary-foreground ring-primary" : "bg-surface-2 ring-hairline hover:bg-accent",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function SuggestionList({
  data, loading, query, onOpenFile, onOpenFolder, onSeeAll,
}: {
  data: DriveSearchResult | undefined;
  loading: boolean;
  query: string;
  onOpenFile: (f: DriveSearchResult["files"][number]) => void;
  onOpenFolder: (f: DriveSearchResult["folders"][number]) => void;
  onSeeAll: () => void;
}) {
  const hasFolders = (data?.folders.length ?? 0) > 0;
  const hasFiles = (data?.files.length ?? 0) > 0;

  return (
    <div className="p-2">
      {hasFolders && (
        <>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Folders</div>
          {data!.folders.map((f) => (
            <button
              key={f.id}
              onClick={() => onOpenFolder(f)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-accent text-left"
            >
              <Folder className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{f.name}</span>
            </button>
          ))}
        </>
      )}
      {hasFiles && (
        <>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Files</div>
          {data!.files.map((f) => (
            <button
              key={f.id}
              onClick={() => onOpenFile(f)}
              className="w-full flex items-start gap-2.5 px-3 py-2 rounded-md hover:bg-accent text-left"
            >
              <FileIcon name={f.name} mime={f.mime_type} className="size-5 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{f.name}</div>
                {f.snippet && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{f.snippet}</div>
                )}
              </div>
            </button>
          ))}
        </>
      )}
      {!hasFolders && !hasFiles && !loading && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches for "{query}"</div>
      )}
      {(hasFolders || hasFiles) && (
        <button
          onClick={onSeeAll}
          className="w-full mt-1 px-3 py-2 text-xs text-primary hover:bg-accent rounded-md text-left"
        >
          See all results for "{query}" →
        </button>
      )}
    </div>
  );
}
