import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchAll, listRecent, listStarred, type FileRow, type FolderRow } from "@/lib/drive-api";
import { FileIcon } from "./FileIcon";
import { Clock, Folder, Star, Upload, FolderPlus, Inbox, Send, Sun, Moon } from "lucide-react";

type Action = { id: string; label: string; icon: React.ReactNode; onSelect: () => void; keywords?: string };

export function CommandPalette({
  open, onOpenChange, userId, actions, onOpenFile, onOpenFolder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  actions: Action[];
  onOpenFile: (f: FileRow) => void;
  onOpenFolder: (f: FolderRow) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const { data: results } = useQuery({
    queryKey: ["drive", "search", userId, q],
    queryFn: () => searchAll(userId, q),
    enabled: open && q.trim().length > 0,
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["drive", "recent", userId, "palette"],
    queryFn: () => listRecent(userId),
    enabled: open && q.trim().length === 0,
  });
  const { data: starred = [] } = useQuery({
    queryKey: ["drive", "starred", userId, "palette"],
    queryFn: () => listStarred(userId),
    enabled: open && q.trim().length === 0,
  });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search files, folders, run an action…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {q.trim() && results && (results.folders.length > 0 || results.files.length > 0) && (
          <>
            {results.folders.length > 0 && (
              <CommandGroup heading="Folders">
                {results.folders.map((f) => (
                  <CommandItem key={f.id} value={`folder-${f.id}-${f.name}`}
                    onSelect={() => { onOpenFolder(f); onOpenChange(false); }}>
                    <Folder className="size-4 text-muted-foreground" /> {f.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.files.length > 0 && (
              <CommandGroup heading="Files">
                {results.files.map((f) => (
                  <CommandItem key={f.id} value={`file-${f.id}-${f.name}`}
                    onSelect={() => { onOpenFile(f); onOpenChange(false); }}>
                    <FileIcon name={f.name} mime={f.mime_type} className="size-5" />
                    <span className="truncate">{f.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {!q.trim() && (
          <>
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem key={a.id} value={`action-${a.id}-${a.label}-${a.keywords ?? ""}`}
                  onSelect={() => { a.onSelect(); onOpenChange(false); }}>
                  {a.icon} {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.slice(0, 5).map((f) => (
                  <CommandItem key={f.id} value={`recent-${f.id}-${f.name}`}
                    onSelect={() => { onOpenFile(f); onOpenChange(false); }}>
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {starred.length > 0 && (
              <CommandGroup heading="Starred">
                {starred.slice(0, 5).map((f) => (
                  <CommandItem key={f.id} value={`starred-${f.id}-${f.name}`}
                    onSelect={() => { onOpenFile(f); onOpenChange(false); }}>
                    <Star className="size-4 text-muted-foreground fill-current" />
                    <span className="truncate">{f.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

// Re-export common icons so the parent can compose actions without extra imports.
export const PaletteIcons = { Upload, FolderPlus, Inbox, Send, Sun, Moon, Star, Clock, Folder };
