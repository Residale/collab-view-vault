import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight, Columns3, Folder, FolderPlus, Grid3x3, List as ListIcon,
  LogOut, Search, Share2, Star, Upload, Clock, Inbox, Send,
  Download, Pencil, Trash2, Move, Link2, Sun, Moon,
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
import { FileIcon } from "@/components/drive/FileIcon";
import { Thumbnail } from "@/components/drive/Thumbnail";
import { PreviewPane } from "@/components/drive/PreviewPane";
import { ShareDialog, type ShareTargetInput } from "@/components/drive/ShareDialog";
import { NewFolderDialog } from "@/components/drive/NewFolderDialog";
import { RenameDialog } from "@/components/drive/RenameDialog";
import { MoveDialog } from "@/components/drive/MoveDialog";
import { CommandPalette } from "@/components/drive/CommandPalette";
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
  const [selectedFile, setSelectedFile] = useState<FileRow | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTargetInput | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: "file" | "folder"; id: string; name: string; currentParent: string | null } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const s = localStorage.getItem("drive-theme");
    if (s) return s === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => { setPath([null]); setSelectedFile(null); }, [section]);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("drive-theme", dark ? "dark" : "light");
  }, [dark]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["drive"] });

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading…</div>;
  }

  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files) return;
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
    try { await deleteFile(f); if (selectedFile?.id === f.id) setSelectedFile(null); invalidate(); toast.success("Deleted"); }
    catch (e: any) { toast.error(e.message); }
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
      if (inField) return;
      if (e.key === "Escape" && selectedFile) { setSelectedFile(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFile) {
        e.preventDefault(); onDeleteFile(selectedFile); return;
      }
      if (e.key === " " && selectedFile) { e.preventDefault(); onDownload(selectedFile); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFile]);

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
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
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
              selectedFile={selectedFile}
              onOpenFolder={(f) => setPath([...path, f.id])}
              onSelectFile={setSelectedFile}
              folderActions={folderActions}
              fileActions={fileActions}
            />
          )}

          <PreviewPane
            file={selectedFile}
            onShare={fileActions.onShare}
            onDelete={onDeleteFile}
            onToggleStar={onStar}
            onDownload={onDownload}
          />
        </div>
      </main>

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
        onOpenFile={(f) => { setSection("my"); setSelectedFile(f); }}
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

/* ---------------- Columns view (Finder-style) ---------------- */

function ColumnsView(props: {
  userId: string; section: Section; path: (string | null)[];
  setPath: (p: (string | null)[]) => void;
  search: string;
  selectedFile: FileRow | null;
  onSelectFile: (f: FileRow | null) => void;
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
        />
      ))}
    </div>
  );
}

function Column(props: {
  userId: string; section: Section; parentId: string | null; depth: number;
  path: (string | null)[]; setPath: (p: (string | null)[]) => void;
  search: string;
  selectedFile: FileRow | null;
  onSelectFile: (f: FileRow | null) => void;
  folderActions: FolderActions;
  fileActions: FileActions;
}) {
  const { userId, section, parentId, depth, path, setPath, search, selectedFile, onSelectFile, folderActions, fileActions } = props;
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

  return (
    <div className="w-72 border-r border-hairline flex flex-col shrink-0 bg-background">
      <div className="px-3 h-8 flex items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground border-b border-hairline/60">
        {depth === 0 ? "Root" : "Subfolder"}
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-1.5 space-y-0.5">
        {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}
        {folders.map((f) => (
          <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
            <button
              onClick={() => { onSelectFile(null); setPath([...path.slice(0, depth + 1), f.id]); }}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md flex items-center justify-between gap-2 group transition-colors",
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
        {files.map((f) => (
          <FileContextMenu key={f.id} file={f} actions={fileActions}>
            <button
              onClick={() => onSelectFile(f)}
              className={cn(
                "w-full px-2.5 py-1.5 text-sm rounded-md flex items-center gap-2.5 transition-colors text-left",
                selectedFile?.id === f.id ? "bg-primary text-primary-foreground" : "hover:bg-surface-2/60",
              )}
            >
              <Thumbnail file={f} className="size-9 rounded-md ring-1 ring-hairline shrink-0" iconClassName="size-5" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className={cn("text-[10px]", selectedFile?.id === f.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {formatBytes(f.size)}
                </div>
              </div>
            </button>
          </FileContextMenu>
        ))}
        {!isLoading && folders.length === 0 && files.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">Empty</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- List / Grid view ---------------- */

function FlatView(props: {
  userId: string; section: Section; path: (string | null)[]; search: string;
  mode: "list" | "grid";
  selectedFile: FileRow | null;
  onOpenFolder: (f: FolderRow) => void;
  onSelectFile: (f: FileRow) => void;
  folderActions: FolderActions;
  fileActions: FileActions;
}) {
  const { userId, section, path, search, mode, selectedFile, onOpenFolder, onSelectFile, folderActions, fileActions } = props;
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

  return (
    <div className="flex-1 overflow-y-auto thin-scroll bg-background">
      {isLoading && <div className="p-8 text-sm text-muted-foreground">Loading…</div>}

      {mode === "list" && (
        <div className="divide-y divide-hairline">
          <div className="grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-9 items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground sticky top-0 bg-background z-10 border-b border-hairline">
            <span>Name</span><span>Size</span><span>Modified</span><span></span>
          </div>
          {folders.map((f) => (
            <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
              <button
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
          {files.map((f) => (
            <FileContextMenu key={f.id} file={f} actions={fileActions}>
              <button
                onClick={() => onSelectFile(f)}
                className={cn(
                  "w-full grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-11 items-center text-left text-sm",
                  selectedFile?.id === f.id ? "bg-surface-2" : "hover:bg-surface-2/60",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Thumbnail file={f} className="size-7 rounded ring-1 ring-hairline shrink-0" iconClassName="size-4" />
                  <span className="truncate font-medium">{f.name}</span>
                </div>
                <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                <span className="text-muted-foreground">{new Date(f.updated_at).toLocaleDateString()}</span>
                <span></span>
              </button>
            </FileContextMenu>
          ))}
          {!isLoading && folders.length === 0 && files.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">Nothing here yet.</div>
          )}
        </div>
      )}

      {mode === "grid" && (
        <div className="p-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {folders.map((f) => (
            <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
              <button
                onDoubleClick={() => onOpenFolder(f)}
                onClick={() => onOpenFolder(f)}
                className="aspect-[4/5] rounded-lg ring-1 ring-hairline bg-surface hover:bg-surface-2 transition-colors p-4 flex flex-col text-left"
              >
                <Folder className="size-8 text-muted-foreground mb-auto" />
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground">Folder</div>
              </button>
            </FolderContextMenu>
          ))}
          {files.map((f) => (
            <FileContextMenu key={f.id} file={f} actions={fileActions}>
              <button
                onClick={() => onSelectFile(f)}
                className={cn(
                  "aspect-[4/5] rounded-lg ring-1 transition-colors overflow-hidden flex flex-col text-left bg-surface",
                  selectedFile?.id === f.id ? "ring-primary" : "ring-hairline hover:ring-foreground/20",
                )}
              >
                <Thumbnail file={f} className="flex-1 w-full" iconClassName="size-10 opacity-70" />
                <div className="p-3 border-t border-hairline bg-surface">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
                </div>
              </button>
            </FileContextMenu>
          ))}
          {!isLoading && folders.length === 0 && files.length === 0 && (
            <div className="col-span-full p-12 text-center text-sm text-muted-foreground">Nothing here yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
