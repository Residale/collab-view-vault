import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight, Columns3, Folder, FolderPlus, Grid3x3, List as ListIcon,
  LogOut, Search, Share2, Star, Upload, Clock, Inbox, Send,
  Download, Pencil, Trash2, Move, Link2, Sun, Moon, Eye,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  createFolder, deleteFile, deleteFolder, getSignedUrl, listFiles, listFolders, listRecent,
  listSharedByMe, listSharedWithMe, listStarred, moveFile, moveFolder, renameFile, renameFolder,
  toggleStar, uploadFile,
  type FileRow, type FolderRow, type Section, formatBytes,
} from "@/lib/drive-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Thumbnail } from "@/components/drive/Thumbnail";
import { QuickLook } from "@/components/drive/QuickLook";
import { ShareDialog, type ShareTargetInput } from "@/components/drive/ShareDialog";
import { NewFolderDialog } from "@/components/drive/NewFolderDialog";
import { RenameDialog } from "@/components/drive/RenameDialog";
import { MoveDialog } from "@/components/drive/MoveDialog";
import { CommandPalette } from "@/components/drive/CommandPalette";
import { SearchBar, type SearchFilters } from "@/components/drive/SearchBar";
import { SearchResults } from "@/components/drive/SearchResults";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";

export const Route = createFileRoute("/drive")({
  head: () => ({
    meta: [
      { title: "My Drive — Archiv" },
      { name: "description", content: "Your company drive." },
    ],
  }),
  component: DrivePage,
});

type ViewMode = "columns" | "list" | "grid";

function DrivePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  const [section, setSection] = useState<Section>("my");
  const [view, setView] = useState<ViewMode>("columns");
  const [path, setPath] = useState<(string | null)[]>([null]);
  // Multi-selection (file ids). Last-clicked is used as anchor for shift-range.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  // Files visible in the active container, used for shift-range and lasso.
  const [activeFiles, setActiveFiles] = useState<FileRow[]>([]);
  // Quick Look modal (Space / double-click)
  const [quickLook, setQuickLook] = useState<FileRow | null>(null);

  const [shareTarget, setShareTarget] = useState<ShareTargetInput | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: "file" | "folder"; id: string; name: string; currentParent: string | null } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Full-text search (header search bar) — when active, replaces main content with results.
  const [activeQuery, setActiveQuery] = useState<string>("");
  const [activeFilters, setActiveFilters] = useState<SearchFilters>({
    types: [], modifiedRange: "any", sizeRange: "any", starred: false,
  });
  const [dragOver, setDragOver] = useState(false);
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const s = localStorage.getItem("drive-theme");
    if (s) return s === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const selectedFile = useMemo(
    () => (selectedIds.size === 1 ? activeFiles.find((f) => selectedIds.has(f.id)) ?? null : null),
    [selectedIds, activeFiles],
  );

  // Selection helpers
  const selectOnly = (id: string) => { setSelectedIds(new Set([id])); setLastSelectedId(id); };
  const toggleInSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastSelectedId(id);
  };
  const selectRange = (id: string) => {
    if (!lastSelectedId || !activeFiles.length) { selectOnly(id); return; }
    const ids = activeFiles.map((f) => f.id);
    const a = ids.indexOf(lastSelectedId);
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) { selectOnly(id); return; }
    const [from, to] = a < b ? [a, b] : [b, a];
    setSelectedIds(new Set(ids.slice(from, to + 1)));
  };
  const handleFileClick = (file: FileRow, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) toggleInSelection(file.id);
    else if (e.shiftKey) selectRange(file.id);
    else selectOnly(file.id);
  };
  const clearSelection = () => { setSelectedIds(new Set()); setLastSelectedId(null); };

  // Lasso selection bridge — child views dispatch a window event to avoid prop drilling.
  useEffect(() => {
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ids: string[] };
      setSelectedIds(new Set(detail.ids));
    };
    window.addEventListener("drive-lasso-set", onSet);
    return () => window.removeEventListener("drive-lasso-set", onSet);
  }, []);

  // Reset state when switching section
  useEffect(() => { setPath([null]); clearSelection(); setQuickLook(null); }, [section]);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("drive-theme", dark ? "dark" : "light");
  }, [dark]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["drive"] });



  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files || !user) return;
    const arr = Array.from(files);
    if (!arr.length) return;

    const currentFolder = path[path.length - 1];
    const id = toast.loading(`Uploading ${arr.length} file${arr.length > 1 ? "s" : ""}…`);
    let done = 0;
    for (const f of arr) {
      try {
        await uploadFile(user.id, currentFolder, f);
        done++;
        toast.loading(`Uploading… ${done}/${arr.length}`, { id });
      } catch (e: any) { toast.error(`${f.name}: ${e.message}`); }
    }
    toast.success(`Uploaded ${done}/${arr.length}`, { id });
    invalidate();
  };

  const onDownload = async (f: FileRow) => {
    try {
      const url = await getSignedUrl(f.storage_path);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  const onCopyLink = async (f: FileRow) => {
    try {
      const url = await getSignedUrl(f.storage_path, 60 * 60 * 24 * 7); // 7 days
      await navigator.clipboard.writeText(url);
      toast.success("Link copied (valid 7 days)");
    } catch (e: any) { toast.error(e.message); }
  };

  const onDeleteFile = async (f: FileRow) => {
    if (!confirm(`Delete "${f.name}"?`)) return;
    try {
      await deleteFile(f);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(f.id); return n; });
      if (quickLook?.id === f.id) setQuickLook(null);
      invalidate(); toast.success("Deleted");
    } catch (e: any) { toast.error(e.message); }
  };

  const onDeleteSelection = async () => {
    const targets = activeFiles.filter((f) => selectedIds.has(f.id));
    if (!targets.length) return;
    if (!confirm(`Delete ${targets.length} item${targets.length > 1 ? "s" : ""}?`)) return;
    const id = toast.loading(`Deleting ${targets.length}…`);
    let done = 0;
    for (const f of targets) {
      try { await deleteFile(f); done++; } catch (e: any) { toast.error(`${f.name}: ${e.message}`); }
    }
    clearSelection();
    invalidate();
    toast.success(`Deleted ${done}/${targets.length}`, { id });
  };

  const onDeleteFolder = async (f: FolderRow) => {
    if (!confirm(`Delete folder "${f.name}"? Its files and subfolders will also be removed.`)) return;
    try {
      await deleteFolder(f.id);
      setPath((p) => p.filter((id) => id !== f.id));
      invalidate();
      toast.success("Folder deleted");
    } catch (e: any) { toast.error(e.message); }
  };

  const onStar = async (f: FileRow) => {
    try { await toggleStar(f); invalidate(); } catch (e: any) { toast.error(e.message); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setPaletteOpen(true); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !inField) {
        if (activeFiles.length) {
          e.preventDefault();
          setSelectedIds(new Set(activeFiles.map((f) => f.id)));
          setLastSelectedId(activeFiles[activeFiles.length - 1].id);
        }
        return;
      }
      if (inField) return;
      if (e.key === "Escape") {
        if (quickLook) { setQuickLook(null); return; }
        if (selectedIds.size) { clearSelection(); return; }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size) {
        e.preventDefault(); onDeleteSelection(); return;
      }
      // Space = Quick Look (Mac Finder style)
      if (e.key === " " && selectedFile && !quickLook) {
        e.preventDefault(); setQuickLook(selectedFile); return;
      }
      // Enter = open / download
      if (e.key === "Enter" && selectedFile) { e.preventDefault(); onDownload(selectedFile); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFile, selectedIds, quickLook, activeFiles]);

  // Drag & drop
  const onDragEnter = (e: React.DragEvent) => {
    if (section !== "my") return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounter.current++;
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  };
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    if (section !== "my") { toast.error("Switch to My Drive to upload"); return; }
    handleUpload(e.dataTransfer.files);
  };

  const folderActions = {
    onShare: (f: FolderRow) => setShareTarget({ type: "folder", id: f.id, name: f.name, ownerId: f.owner_id }),
    onRename: (f: FolderRow) => setRenameTarget({ kind: "folder", id: f.id, name: f.name }),
    onMove: (f: FolderRow) => setMoveTarget({ kind: "folder", id: f.id, name: f.name, currentParent: f.parent_id }),
    onDelete: onDeleteFolder,
  };
  const fileActions = {
    onShare: (f: FileRow) => setShareTarget({ type: "file", id: f.id, name: f.name, ownerId: f.owner_id }),
    onRename: (f: FileRow) => setRenameTarget({ kind: "file", id: f.id, name: f.name }),
    onMove: (f: FileRow) => setMoveTarget({ kind: "file", id: f.id, name: f.name, currentParent: f.folder_id }),
    onDelete: onDeleteFile,
    onDownload,
    onCopyLink,
    onStar,
  };

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading…</div>;
  }

  return (

    <div
      className="flex h-screen bg-background text-foreground font-sans selection:bg-muted relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef} type="file" multiple className="hidden"
        onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
      />

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center pointer-events-none border-2 border-dashed border-primary m-3 rounded-xl">
          <div className="text-center">
            <Upload className="size-10 mx-auto mb-3 text-primary" />
            <p className="text-lg font-medium">Drop files to upload</p>
            <p className="text-sm text-muted-foreground mt-1">
              Into {path.length > 1 ? "current folder" : "My Drive"}
            </p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-60 bg-sidebar border-r border-hairline flex flex-col shrink-0">
        <div className="p-5 flex items-center gap-2">
          <div className="size-6 bg-primary rounded-sm" />
          <span className="font-semibold tracking-tight">Archiv.</span>
        </div>

        <nav className="px-3 space-y-0.5">
          <NavItem icon={<Folder className="size-4" />} label="My Drive" active={section === "my"} onClick={() => setSection("my")} />
          <NavItem icon={<Inbox className="size-4" />} label="Shared with me" active={section === "shared-with-me"} onClick={() => setSection("shared-with-me")} />
          <NavItem icon={<Send className="size-4" />} label="Shared by me" active={section === "shared-by-me"} onClick={() => setSection("shared-by-me")} />
          <NavItem icon={<Clock className="size-4" />} label="Recent" active={section === "recent"} onClick={() => setSection("recent")} />
          <NavItem icon={<Star className="size-4" />} label="Starred" active={section === "starred"} onClick={() => setSection("starred")} />
        </nav>

        <div className="mt-auto p-4 space-y-3">
          <Button className="w-full" onClick={() => fileInputRef.current?.click()}>
            <Upload /> Upload files
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setFolderDialog(true)} disabled={section !== "my"}>
            <FolderPlus /> New folder
          </Button>
          <button
            onClick={() => signOut()}
            className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 px-2 py-1"
          >
            <LogOut className="size-3.5" /> {user.email}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-hairline flex items-center justify-between px-6 bg-background gap-4">
          <Breadcrumb section={section} path={path} setPath={setPath} />
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 h-8 px-2.5 text-xs text-muted-foreground bg-surface-2 rounded-md ring-1 ring-hairline hover:text-foreground transition-colors"
            >
              <Search className="size-3.5" /> Quick find
              <kbd className="ml-2 text-[10px] font-mono bg-background px-1.5 py-0.5 rounded ring-1 ring-hairline">⌘K</kbd>
            </button>
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter…"
                className="w-44 pl-8 h-8 text-sm bg-surface-2 border-0"
              />
            </div>
            <button
              onClick={() => setDark((v) => !v)}
              className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2"
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
            <div className="flex items-center bg-surface-2 p-0.5 rounded-md ring-1 ring-hairline">
              <ViewToggle active={view === "columns"} onClick={() => setView("columns")} icon={<Columns3 className="size-3.5" />} />
              <ViewToggle active={view === "list"} onClick={() => setView("list")} icon={<ListIcon className="size-3.5" />} />
              <ViewToggle active={view === "grid"} onClick={() => setView("grid")} icon={<Grid3x3 className="size-3.5" />} />
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {view === "columns" ? (
            <ColumnsView
              userId={user.id}
              section={section}
              path={path}
              setPath={setPath}
              search={search}
              selectedIds={selectedIds}
              onFileClick={handleFileClick}
              onFileOpen={(f) => setQuickLook(f)}
              onBackgroundClick={clearSelection}
              onActiveFiles={setActiveFiles}
              folderActions={folderActions}
              fileActions={fileActions}
            />
          ) : (
            <FlatView
              userId={user.id}
              section={section}
              path={path}
              search={search}
              mode={view}
              selectedIds={selectedIds}
              onFileClick={handleFileClick}
              onFileOpen={(f) => setQuickLook(f)}
              onOpenFolder={(f) => setPath([...path, f.id])}
              onBackgroundClick={clearSelection}
              onActiveFiles={setActiveFiles}
              folderActions={folderActions}
              fileActions={fileActions}
            />
          )}
        </div>

        {/* Selection action bar */}
        {selectedIds.size > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-surface ring-1 ring-hairline rounded-full pl-4 pr-1.5 py-1.5 shadow-pane">
            <span className="text-xs font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="h-7 rounded-full">Clear</Button>
            <Button size="sm" variant="destructive" onClick={onDeleteSelection} className="h-7 rounded-full">
              <Trash2 /> Delete
            </Button>
          </div>
        )}
      </main>

      <QuickLook
        file={quickLook}
        onClose={() => setQuickLook(null)}
        onDownload={onDownload}
        onShare={fileActions.onShare}
        onToggleStar={onStar}
      />

      <ShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />
      <NewFolderDialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        onCreate={async (name) => {
          try {
            await createFolder(user.id, path[path.length - 1], name);
            invalidate();
            toast.success("Folder created");
          } catch (e: any) { toast.error(e.message); }
        }}
      />

      <RenameDialog
        open={!!renameTarget}
        onOpenChange={(v) => !v && setRenameTarget(null)}
        initial={renameTarget?.name ?? ""}
        title={renameTarget?.kind === "folder" ? "Rename folder" : "Rename file"}
        onSubmit={async (name) => {
          if (!renameTarget) return;
          try {
            if (renameTarget.kind === "folder") await renameFolder(renameTarget.id, name);
            else await renameFile(renameTarget.id, name);
            invalidate(); toast.success("Renamed");
          } catch (e: any) { toast.error(e.message); }
        }}
      />

      {moveTarget && (
        <MoveDialog
          open={true}
          onOpenChange={(v) => !v && setMoveTarget(null)}
          ownerId={user.id}
          itemName={moveTarget.name}
          currentParentId={moveTarget.currentParent}
          excludeFolderId={moveTarget.kind === "folder" ? moveTarget.id : undefined}
          onMove={async (folderId) => {
            try {
              if (moveTarget.kind === "file") await moveFile(moveTarget.id, folderId);
              else await moveFolder(moveTarget.id, folderId);
              invalidate(); toast.success("Moved");
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        userId={user.id}
        onOpenFile={(f) => { setSection("my"); setQuickLook(f); }}
        onOpenFolder={(f) => { setSection("my"); setPath([null, f.id]); }}
        actions={[
          { id: "upload", label: "Upload files", icon: <Upload className="size-4" />, onSelect: () => fileInputRef.current?.click() },
          { id: "new-folder", label: "New folder", icon: <FolderPlus className="size-4" />, onSelect: () => setFolderDialog(true) },
          { id: "my", label: "Go to My Drive", icon: <Folder className="size-4" />, onSelect: () => setSection("my") },
          { id: "shared-with-me", label: "Go to Shared with me", icon: <Inbox className="size-4" />, onSelect: () => setSection("shared-with-me") },
          { id: "shared-by-me", label: "Go to Shared by me", icon: <Send className="size-4" />, onSelect: () => setSection("shared-by-me") },
          { id: "recent", label: "Go to Recent", icon: <Clock className="size-4" />, onSelect: () => setSection("recent") },
          { id: "starred", label: "Go to Starred", icon: <Star className="size-4" />, onSelect: () => setSection("starred") },
          { id: "theme", label: dark ? "Switch to light mode" : "Switch to dark mode", icon: dark ? <Sun className="size-4" /> : <Moon className="size-4" />, onSelect: () => setDark((v) => !v), keywords: "theme dark light" },
        ]}
      />
    </div>
  );
}

type FolderActions = {
  onShare: (f: FolderRow) => void;
  onRename: (f: FolderRow) => void;
  onMove: (f: FolderRow) => void;
  onDelete: (f: FolderRow) => void;
};
type FileActions = {
  onShare: (f: FileRow) => void;
  onRename: (f: FileRow) => void;
  onMove: (f: FileRow) => void;
  onDelete: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
  onCopyLink: (f: FileRow) => void;
  onStar: (f: FileRow) => void;
};

function FolderContextMenu({ folder, actions, children }: { folder: FolderRow; actions: FolderActions; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => actions.onShare(folder)}><Share2 className="size-3.5 mr-2" /> Share</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onRename(folder)}><Pencil className="size-3.5 mr-2" /> Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onMove(folder)}><Move className="size-3.5 mr-2" /> Move…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onDelete(folder)} className="text-destructive focus:text-destructive">
          <Trash2 className="size-3.5 mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileContextMenu({ file, actions, children }: { file: FileRow; actions: FileActions; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => actions.onDownload(file)}><Download className="size-3.5 mr-2" /> Download</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onCopyLink(file)}><Link2 className="size-3.5 mr-2" /> Copy link</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onShare(file)}><Share2 className="size-3.5 mr-2" /> Share with people</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onStar(file)}><Star className={cn("size-3.5 mr-2", file.starred && "fill-current")} /> {file.starred ? "Unstar" : "Star"}</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onRename(file)}><Pencil className="size-3.5 mr-2" /> Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onMove(file)}><Move className="size-3.5 mr-2" /> Move…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onDelete(file)} className="text-destructive focus:text-destructive">
          <Trash2 className="size-3.5 mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors",
        active ? "bg-surface text-foreground ring-1 ring-hairline shadow-architect font-medium"
               : "text-muted-foreground hover:bg-surface/60",
      )}
    >
      {icon} {label}
    </button>
  );
}

function ViewToggle({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("p-1.5 rounded-sm transition-colors", active ? "bg-background shadow-architect text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {icon}
    </button>
  );
}

function Breadcrumb({ section, path, setPath }: { section: Section; path: (string | null)[]; setPath: (p: (string | null)[]) => void }) {
  const sectionLabel = {
    my: "My Drive", "shared-with-me": "Shared with me", "shared-by-me": "Shared by me",
    recent: "Recent", starred: "Starred", trash: "Trash",
  }[section];
  return (
    <nav className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground min-w-0">
      <button onClick={() => setPath([null])} className="hover:text-foreground">{sectionLabel}</button>
      {path.slice(1).map((id, i) => (
        <span key={id} className="flex items-center gap-1.5">
          <ChevronRight className="size-3.5 text-muted-foreground/50" />
          <button
            onClick={() => setPath(path.slice(0, i + 2))}
            className={cn(i === path.length - 2 ? "text-foreground" : "hover:text-foreground")}
          >
            <FolderName id={id!} />
          </button>
        </span>
      ))}
    </nav>
  );
}

function FolderName({ id }: { id: string }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["drive", "folder-name", id],
    queryFn: async () => {
      const { data, error } = await (await import("@/integrations/supabase/client")).supabase
        .from("folders").select("name").eq("id", id).maybeSingle();
      if (error) throw error;
      return data?.name ?? "Folder";
    },
    enabled: !!user,
  });
  return <>{data ?? "…"}</>;
}

/* ---------------- Lasso selection hook ---------------- */

function useLasso(
  containerRef: React.RefObject<HTMLDivElement | null>,
  getItems: () => { id: string; el: HTMLElement }[],
  onSelect: (ids: Set<string>, additive: boolean) => void,
  onBackgroundClick?: () => void,
) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0, startY = 0, additive = false, active = false, moved = false;
    let baseScrollTop = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Don't start lasso if user pressed on an interactive item.
      const target = e.target as HTMLElement;
      if (target.closest("[data-drive-item], button, a, input, [role='menuitem']")) return;
      const cRect = el.getBoundingClientRect();
      startX = e.clientX - cRect.left + el.scrollLeft;
      startY = e.clientY - cRect.top + el.scrollTop;
      baseScrollTop = el.scrollTop;
      additive = e.metaKey || e.ctrlKey || e.shiftKey;
      active = true;
      moved = false;
      e.preventDefault();
    };

    const onMove = (e: MouseEvent) => {
      if (!active) return;
      const cRect = el.getBoundingClientRect();
      const curX = e.clientX - cRect.left + el.scrollLeft;
      const curY = e.clientY - cRect.top + el.scrollTop;
      const dx = Math.abs(curX - startX);
      const dy = Math.abs(curY - startY);
      if (!moved && dx < 4 && dy < 4) return;
      moved = true;
      const x = Math.min(startX, curX);
      const y = Math.min(startY, curY);
      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      setRect({ x, y, w, h });

      // Compute selection
      const items = getItems();
      const hit = new Set<string>();
      const cTop = cRect.top;
      const cLeft = cRect.left;
      const lassoLeft = x + cLeft - el.scrollLeft;
      const lassoTop = y + cTop - el.scrollTop + (el.scrollTop - baseScrollTop);
      // Simpler: use bounding rects in viewport coords directly
      const vx1 = Math.min(e.clientX, cLeft + startX - el.scrollLeft);
      const vy1 = Math.min(e.clientY, cTop + startY - el.scrollTop);
      const vx2 = Math.max(e.clientX, cLeft + startX - el.scrollLeft);
      const vy2 = Math.max(e.clientY, cTop + startY - el.scrollTop);
      void lassoLeft; void lassoTop;
      for (const it of items) {
        const r = it.el.getBoundingClientRect();
        const intersects = r.right >= vx1 && r.left <= vx2 && r.bottom >= vy1 && r.top <= vy2;
        if (intersects) hit.add(it.id);
      }
      onSelect(hit, additive);
    };

    const onUp = () => {
      if (!active) return;
      if (!moved && onBackgroundClick) onBackgroundClick();
      active = false;
      setRect(null);
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [containerRef, getItems, onSelect, onBackgroundClick]);

  return rect;
}

/* ---------------- Columns view (Finder-style) ---------------- */

function ColumnsView(props: {
  userId: string; section: Section; path: (string | null)[];
  setPath: (p: (string | null)[]) => void;
  search: string;
  selectedIds: Set<string>;
  onFileClick: (f: FileRow, e: React.MouseEvent) => void;
  onFileOpen: (f: FileRow) => void;
  onBackgroundClick: () => void;
  onActiveFiles: (files: FileRow[]) => void;
  folderActions: FolderActions;
  fileActions: FileActions;
}) {
  return (
    <div className="flex-1 flex overflow-x-auto thin-scroll bg-background min-w-0">
      {props.path.map((parentId, depth) => (
        <Column
          key={`${depth}-${parentId ?? "root"}`}
          {...props}
          parentId={parentId}
          depth={depth}
          isLast={depth === props.path.length - 1}
        />
      ))}
    </div>
  );
}

function Column(props: {
  userId: string; section: Section; parentId: string | null; depth: number; isLast: boolean;
  path: (string | null)[]; setPath: (p: (string | null)[]) => void;
  search: string;
  selectedIds: Set<string>;
  onFileClick: (f: FileRow, e: React.MouseEvent) => void;
  onFileOpen: (f: FileRow) => void;
  onBackgroundClick: () => void;
  onActiveFiles: (files: FileRow[]) => void;
  folderActions: FolderActions;
  fileActions: FileActions;
}) {
  const {
    userId, section, parentId, depth, isLast, path, setPath, search,
    selectedIds, onFileClick, onFileOpen, onBackgroundClick, onActiveFiles,
    folderActions, fileActions,
  } = props;
  const activeChildId = path[depth + 1] ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["drive", section, "column", userId, parentId],
    queryFn: async () => {
      if (section === "my") {
        const [folders, files] = await Promise.all([listFolders(parentId, userId), listFiles(parentId, userId)]);
        return { folders, files };
      }
      if (depth > 0) {
        const [folders, files] = await Promise.all([listFolders(parentId, userId), listFiles(parentId, userId)]);
        return { folders, files };
      }
      if (section === "shared-with-me") return listSharedWithMe(userId);
      if (section === "shared-by-me") {
        const r = await listSharedByMe(userId);
        return { folders: r.folders, files: r.files };
      }
      if (section === "recent") return { folders: [], files: await listRecent(userId) };
      if (section === "starred") return { folders: [], files: await listStarred(userId) };
      return { folders: [], files: [] };
    },
  });

  const folders = (data?.folders ?? []).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const files = (data?.files ?? []).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  // Publish active files only from the last (deepest) column.
  useEffect(() => {
    if (isLast) onActiveFiles(files);
  }, [isLast, data]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const lassoBaseRef = useRef<Set<string>>(new Set());

  const lassoRect = useLasso(
    scrollRef,
    () => Array.from(itemRefs.current.entries()).map(([id, el]) => ({ id, el })),
    (hit, additive) => {
      if (!isLast) return;
      if (additive) {
        const merged = new Set(lassoBaseRef.current);
        hit.forEach((id) => merged.add(id));
        // Apply: call onFileClick with a synthetic? Simpler: rebuild via parent setter — not available here.
        // We approximate by selecting each via onFileClick with meta.
        // Instead, send a custom event up through window:
        window.dispatchEvent(new CustomEvent("drive-lasso-set", { detail: { ids: Array.from(merged) } }));
      } else {
        window.dispatchEvent(new CustomEvent("drive-lasso-set", { detail: { ids: Array.from(hit) } }));
      }
    },
    () => { if (isLast) onBackgroundClick(); },
  );

  // Capture base selection at lasso start
  useEffect(() => {
    const onDown = () => { lassoBaseRef.current = new Set(selectedIds); };
    const el = scrollRef.current;
    el?.addEventListener("mousedown", onDown);
    return () => el?.removeEventListener("mousedown", onDown);
  }, [selectedIds]);

  return (
    <div className="w-72 border-r border-hairline flex flex-col shrink-0 bg-background">
      <div className="px-3 h-8 flex items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground border-b border-hairline/60">
        {depth === 0 ? "Root" : "Subfolder"}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll p-2 relative select-none">
        {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}

        {/* Folders — compact rectangular rows */}
        {folders.length > 0 && (
          <div className="space-y-0.5 mb-3">
            {folders.map((f) => (
              <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
                <button
                  data-drive-item="folder"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBackgroundClick();
                    setPath([...path.slice(0, depth + 1), f.id]);
                  }}
                  className={cn(
                    "w-full px-2.5 py-2 text-sm rounded-md flex items-center justify-between gap-2 transition-colors text-left",
                    activeChildId === f.id ? "bg-surface-2 ring-1 ring-hairline" : "hover:bg-surface-2/60",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="size-4 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{f.name}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0" />
                </button>
              </FolderContextMenu>
            ))}
          </div>
        )}

        {/* Files — square thumbnail grid */}
        {files.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {files.map((f) => {
              const isSelected = selectedIds.has(f.id);
              return (
                <FileContextMenu key={f.id} file={f} actions={fileActions}>
                  <button
                    data-drive-item="file"
                    ref={(el) => {
                      if (el) itemRefs.current.set(f.id, el);
                      else itemRefs.current.delete(f.id);
                    }}
                    onClick={(e) => { e.stopPropagation(); onFileClick(f, e); }}
                    onDoubleClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                    className={cn(
                      "rounded-lg ring-1 transition-all overflow-hidden text-left bg-surface group",
                      isSelected
                        ? "ring-2 ring-primary shadow-pane"
                        : "ring-hairline hover:ring-foreground/20 hover:shadow-architect",
                    )}
                    title={f.name}
                  >
                    <div className="aspect-square w-full overflow-hidden bg-surface-2 relative">
                      <Thumbnail file={f} className="size-full" iconClassName="size-8 opacity-70" />
                      <button
                        onClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                        className="absolute top-1.5 right-1.5 size-6 grid place-items-center rounded-md bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity ring-1 ring-hairline hover:bg-background"
                        title="Quick Look (Space)"
                      >
                        <Eye className="size-3" />
                      </button>
                    </div>
                    <div className="px-2 py-1.5 border-t border-hairline">
                      <div className="text-[11px] font-medium truncate leading-tight">{f.name}</div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">{formatBytes(f.size)}</div>
                    </div>
                  </button>
                </FileContextMenu>
              );
            })}
          </div>
        )}

        {!isLoading && folders.length === 0 && files.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">Empty</div>
        )}

        {/* Lasso rectangle */}
        {lassoRect && (
          <div
            className="absolute pointer-events-none bg-primary/10 border border-primary/60 rounded-sm"
            style={{ left: lassoRect.x, top: lassoRect.y, width: lassoRect.w, height: lassoRect.h }}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- List / Grid view ---------------- */

function FlatView(props: {
  userId: string; section: Section; path: (string | null)[]; search: string;
  mode: "list" | "grid";
  selectedIds: Set<string>;
  onFileClick: (f: FileRow, e: React.MouseEvent) => void;
  onFileOpen: (f: FileRow) => void;
  onOpenFolder: (f: FolderRow) => void;
  onBackgroundClick: () => void;
  onActiveFiles: (files: FileRow[]) => void;
  folderActions: FolderActions;
  fileActions: FileActions;
}) {
  const {
    userId, section, path, search, mode, selectedIds,
    onFileClick, onFileOpen, onOpenFolder, onBackgroundClick, onActiveFiles,
    folderActions, fileActions,
  } = props;
  const parentId = path[path.length - 1];

  const { data, isLoading } = useQuery({
    queryKey: ["drive", section, "flat", userId, parentId],
    queryFn: async () => {
      if (section === "my" || path.length > 1) {
        const [folders, files] = await Promise.all([listFolders(parentId, userId), listFiles(parentId, userId)]);
        return { folders, files };
      }
      if (section === "shared-with-me") return listSharedWithMe(userId);
      if (section === "shared-by-me") {
        const r = await listSharedByMe(userId);
        return { folders: r.folders, files: r.files };
      }
      if (section === "recent") return { folders: [], files: await listRecent(userId) };
      if (section === "starred") return { folders: [], files: await listStarred(userId) };
      return { folders: [], files: [] };
    },
  });

  const folders = (data?.folders ?? []).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  const files = (data?.files ?? []).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => { onActiveFiles(files); }, [data]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const lassoBaseRef = useRef<Set<string>>(new Set());

  const lassoRect = useLasso(
    scrollRef,
    () => Array.from(itemRefs.current.entries()).map(([id, el]) => ({ id, el })),
    (hit, additive) => {
      const merged = additive ? new Set(lassoBaseRef.current) : new Set<string>();
      hit.forEach((id) => merged.add(id));
      window.dispatchEvent(new CustomEvent("drive-lasso-set", { detail: { ids: Array.from(merged) } }));
    },
    onBackgroundClick,
  );

  useEffect(() => {
    const onDown = () => { lassoBaseRef.current = new Set(selectedIds); };
    const el = scrollRef.current;
    el?.addEventListener("mousedown", onDown);
    return () => el?.removeEventListener("mousedown", onDown);
  }, [selectedIds]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll bg-background relative select-none">
      {isLoading && <div className="p-8 text-sm text-muted-foreground">Loading…</div>}

      {mode === "list" && (
        <div className="divide-y divide-hairline">
          <div className="grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-9 items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground sticky top-0 bg-background z-10 border-b border-hairline">
            <span>Name</span><span>Size</span><span>Modified</span><span></span>
          </div>
          {folders.map((f) => (
            <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
              <button
                data-drive-item="folder"
                onDoubleClick={() => onOpenFolder(f)}
                onClick={() => onOpenFolder(f)}
                className="w-full grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-11 items-center text-left text-sm hover:bg-surface-2/60 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Folder className="size-4 text-muted-foreground" />
                  <span className="truncate font-medium">{f.name}</span>
                </div>
                <span className="text-muted-foreground">—</span>
                <span className="text-muted-foreground">{new Date(f.updated_at).toLocaleDateString()}</span>
                <span className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); folderActions.onShare(f); }}>
                  <Share2 className="size-3.5 text-muted-foreground hover:text-foreground" />
                </span>
              </button>
            </FolderContextMenu>
          ))}
          {files.map((f) => {
            const isSelected = selectedIds.has(f.id);
            return (
              <FileContextMenu key={f.id} file={f} actions={fileActions}>
                <button
                  data-drive-item="file"
                  ref={(el) => { if (el) itemRefs.current.set(f.id, el); else itemRefs.current.delete(f.id); }}
                  onClick={(e) => { e.stopPropagation(); onFileClick(f, e); }}
                  onDoubleClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                  className={cn(
                    "w-full grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-11 items-center text-left text-sm",
                    isSelected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Thumbnail file={f} className="size-8 rounded ring-1 ring-hairline shrink-0" iconClassName="size-4" />
                    <span className="truncate font-medium">{f.name}</span>
                  </div>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                  <span className="text-muted-foreground">{new Date(f.updated_at).toLocaleDateString()}</span>
                  <span></span>
                </button>
              </FileContextMenu>
            );
          })}
          {!isLoading && folders.length === 0 && files.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">Nothing here yet.</div>
          )}
        </div>
      )}

      {mode === "grid" && (
        <div className="p-6 space-y-6">
          {folders.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">Folders</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                {folders.map((f) => (
                  <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
                    <button
                      data-drive-item="folder"
                      onDoubleClick={() => onOpenFolder(f)}
                      onClick={() => onOpenFolder(f)}
                      className="h-12 rounded-lg ring-1 ring-hairline bg-surface hover:bg-surface-2 transition-colors px-3 flex items-center gap-3 text-left"
                    >
                      <Folder className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{f.name}</span>
                    </button>
                  </FolderContextMenu>
                ))}
              </div>
            </div>
          )}
          {files.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">Files</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {files.map((f) => {
                  const isSelected = selectedIds.has(f.id);
                  return (
                    <FileContextMenu key={f.id} file={f} actions={fileActions}>
                      <button
                        data-drive-item="file"
                        ref={(el) => { if (el) itemRefs.current.set(f.id, el); else itemRefs.current.delete(f.id); }}
                        onClick={(e) => { e.stopPropagation(); onFileClick(f, e); }}
                        onDoubleClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                        className={cn(
                          "rounded-lg ring-1 transition-all overflow-hidden flex flex-col text-left bg-surface group",
                          isSelected ? "ring-2 ring-primary shadow-pane" : "ring-hairline hover:ring-foreground/20 hover:shadow-architect",
                        )}
                      >
                        <div className="aspect-square w-full bg-surface-2 relative overflow-hidden">
                          <Thumbnail file={f} className="size-full" iconClassName="size-10 opacity-70" />
                          <button
                            onClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                            className="absolute top-2 right-2 size-7 grid place-items-center rounded-md bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 ring-1 ring-hairline hover:bg-background"
                            title="Quick Look (Space)"
                          >
                            <Eye className="size-3.5" />
                          </button>
                        </div>
                        <div className="p-2.5 border-t border-hairline bg-surface">
                          <div className="text-sm font-medium truncate">{f.name}</div>
                          <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
                        </div>
                      </button>
                    </FileContextMenu>
                  );
                })}
              </div>
            </div>
          )}
          {!isLoading && folders.length === 0 && files.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">Nothing here yet.</div>
          )}
        </div>
      )}

      {lassoRect && (
        <div
          className="absolute pointer-events-none bg-primary/10 border border-primary/60 rounded-sm"
          style={{ left: lassoRect.x, top: lassoRect.y, width: lassoRect.w, height: lassoRect.h }}
        />
      )}
    </div>
  );
}
