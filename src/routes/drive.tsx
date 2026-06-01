import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Columns3, Folder, FolderPlus, Grid3x3, List as ListIcon,
  LogOut, Search, Share2, Star, Upload, Clock, Inbox, Send,
  Download, Pencil, Trash2, Move, Link2, Sun, Moon, RotateCcw, X,
  Palette, Check, Link as LinkIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  createExternalLink, createFolder, deleteFile, deleteFolder, detectExternalLink, externalUrl,
  getSignedUrl, isExternalLink, listFiles, listFolders, listRecent,
  listSharedByMe, listSharedWithMe, listStarred, listTrash, moveFile, moveFolder, renameFile, renameFolder,
  restoreFile, restoreFolder, setFolderColor, toggleStar, trashFile, trashFolder, uploadFile,
  type FileRow, type FolderRow, type Section, formatBytes,
} from "@/lib/drive-api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Thumbnail } from "@/components/drive/Thumbnail";
import { FileTypeBadge, FileIcon } from "@/components/drive/FileIcon";
import { FolderIcon, FOLDER_PALETTE, DEFAULT_FOLDER_COLOR } from "@/components/drive/FolderIcon";
import { QuickLook } from "@/components/drive/QuickLook";
import { PreviewPane } from "@/components/drive/PreviewPane";
import { ShareDialog, type ShareTargetInput } from "@/components/drive/ShareDialog";
import { NewFolderDialog } from "@/components/drive/NewFolderDialog";
import { AddLinkDialog } from "@/components/drive/AddLinkDialog";
import { RenameDialog } from "@/components/drive/RenameDialog";
import { MoveDialog } from "@/components/drive/MoveDialog";
import { CommandPalette } from "@/components/drive/CommandPalette";
import { CheatsheetDialog } from "@/components/drive/CheatsheetDialog";
import { SearchBar, type SearchFilters } from "@/components/drive/SearchBar";
import { SearchResults } from "@/components/drive/SearchResults";
import { SavedSearchesSection } from "@/components/drive/SavedSearches";
import { SelectionBar } from "@/components/drive/SelectionBar";
import { SelectionCheckbox } from "@/components/drive/SelectionCheckbox";
import { setDragPayload, getDragPayload, isDriveDrag, isExternalFileDrag, type DragPayload } from "@/components/drive/dnd";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
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
  // Folders can also be selected (via checkbox or context menu in the bottom bar).
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  // Files visible in the active container, used for shift-range and lasso.
  const [activeFiles, setActiveFiles] = useState<FileRow[]>([]);
  const [activeFolders, setActiveFolders] = useState<FolderRow[]>([]);
  // Quick Look modal (Space / double-click / "Open" button)
  const [quickLook, setQuickLook] = useState<FileRow | null>(null);
  // Right-side preview pane — set by a single click on a file.
  // Independent from `selectedIds` (selection is only via the checkbox icon).
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);

  const [shareTarget, setShareTarget] = useState<ShareTargetInput | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: "file" | "folder"; id: string; name: string; currentParent: string | null } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
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
  const folderInputRef = useRef<HTMLInputElement>(null);
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
    // Plain click → just preview. NEVER mutate selection on plain click —
    // selection is opt-in via the checkbox icon on each row/tile.
    if (e.metaKey || e.ctrlKey) toggleInSelection(file.id);
    else if (e.shiftKey) selectRange(file.id);
    else setPreviewFile(file);
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectedFolderIds(new Set());
    setLastSelectedId(null);
  };
  const toggleFolderInSelection = (id: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Lasso selection bridge — child views dispatch window events to avoid prop drilling.
  useEffect(() => {
    const onSetFiles = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ids: string[] };
      setSelectedIds(new Set(detail.ids));
    };
    const onSetFolders = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ids: string[] };
      setSelectedFolderIds(new Set(detail.ids));
    };
    window.addEventListener("drive-lasso-set", onSetFiles);
    window.addEventListener("drive-lasso-set-folders", onSetFolders);
    return () => {
      window.removeEventListener("drive-lasso-set", onSetFiles);
      window.removeEventListener("drive-lasso-set-folders", onSetFolders);
    };
  }, []);

  // Reset state when switching section
  useEffect(() => { setPath([null]); clearSelection(); setQuickLook(null); setPreviewFile(null); }, [section]);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("drive-theme", dark ? "dark" : "light");
  }, [dark]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["drive"] });



  // Upload a flat list of files (no folder structure).
  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files || !user) return;
    const arr = Array.from(files).filter((f) => f.size > 0 || f.type !== "");
    if (!arr.length) return;
    await handleUploadEntries(arr.map((f) => ({ file: f, relPath: [] })));
  };

  // Upload files preserving folder structure. relPath = directory segments
  // relative to the current folder (excluding the filename).
  const handleUploadEntries = async (
    entries: { file: File; relPath: string[] }[],
  ) => {
    if (!user || !entries.length) return;
    const currentFolder = path[path.length - 1];
    const id = toast.loading(`Uploading ${entries.length} item${entries.length > 1 ? "s" : ""}…`);

    // Create folders on-demand, caching path → folderId.
    const folderCache = new Map<string, string | null>();
    folderCache.set("", currentFolder);
    const ensureFolder = async (segments: string[]): Promise<string | null> => {
      const key = segments.join("/");
      if (folderCache.has(key)) return folderCache.get(key)!;
      const parent = await ensureFolder(segments.slice(0, -1));
      try {
        const created = await createFolder(user.id, parent, segments[segments.length - 1]);
        folderCache.set(key, created.id);
        return created.id;
      } catch (e: any) {
        toast.error(`Folder ${segments.join("/")}: ${e.message}`);
        folderCache.set(key, parent);
        return parent;
      }
    };

    let done = 0;
    for (const { file, relPath } of entries) {
      try {
        const folderId = await ensureFolder(relPath);
        await uploadFile(user.id, folderId, file);
        done++;
        toast.loading(`Uploading… ${done}/${entries.length}`, { id });
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message ?? "Failed to upload"}`);
      }
    }
    toast.success(`Uploaded ${done}/${entries.length}`, { id });
    invalidate();
  };

  // Walk a FileSystemEntry tree (from drag-and-drop) into a flat list.
  const readEntries = async (entry: any, prefix: string[] = []): Promise<{ file: File; relPath: string[] }[]> => {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      return [{ file, relPath: prefix }];
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: any[] = [];
      // readEntries returns max 100 at a time; loop until empty.
      while (true) {
        const batch: any[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        all.push(...batch);
      }
      const nested = await Promise.all(all.map((e) => readEntries(e, [...prefix, entry.name])));
      return nested.flat();
    }
    return [];
  };


  const onDownload = async (f: FileRow) => {
    if (isExternalLink(f)) {
      window.open(externalUrl(f), "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const url = await getSignedUrl(f.storage_path);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  const onCopyLink = async (f: FileRow) => {
    if (isExternalLink(f)) {
      try { await navigator.clipboard.writeText(externalUrl(f)); toast.success("URL copied"); }
      catch (e: any) { toast.error(e.message); }
      return;
    }
    try {
      const url = await getSignedUrl(f.storage_path, 60 * 60 * 24 * 7); // 7 days
      await navigator.clipboard.writeText(url);
      toast.success("Link copied (valid 7 days)");
    } catch (e: any) { toast.error(e.message); }
  };

  const onDeleteFile = async (f: FileRow) => {
    try {
      await trashFile(f.id);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(f.id); return n; });
      if (quickLook?.id === f.id) setQuickLook(null);
      invalidate();
      toast.success(`"${f.name}" moved to Trash`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try { await restoreFile(f.id); invalidate(); toast.success("Restored"); }
            catch (e: any) { toast.error(e.message); }
          },
        },
        duration: 6000,
      });
    } catch (e: any) { toast.error(e.message); }
  };

  const onDeleteSelection = async () => {
    const targets = activeFiles.filter((f) => selectedIds.has(f.id));
    if (!targets.length) return;
    const id = toast.loading(`Moving ${targets.length} to Trash…`);
    let done = 0;
    const ids: string[] = [];
    for (const f of targets) {
      try { await trashFile(f.id); ids.push(f.id); done++; } catch (e: any) { toast.error(`${f.name}: ${e.message}`); }
    }
    clearSelection();
    invalidate();
    toast.success(`${done} item${done > 1 ? "s" : ""} moved to Trash`, {
      id,
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            await Promise.all(ids.map((i) => restoreFile(i)));
            invalidate(); toast.success("Restored");
          } catch (e: any) { toast.error(e.message); }
        },
      },
      duration: 6000,
    });
  };

  const onDeleteFolder = async (f: FolderRow) => {
    try {
      await trashFolder(f.id);
      setPath((p) => p.filter((id) => id !== f.id));
      invalidate();
      toast.success(`Folder "${f.name}" moved to Trash`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try { await restoreFolder(f.id); invalidate(); toast.success("Restored"); }
            catch (e: any) { toast.error(e.message); }
          },
        },
        duration: 6000,
      });
    } catch (e: any) { toast.error(e.message); }
  };


  const onStar = async (f: FileRow) => {
    try { await toggleStar(f); invalidate(); } catch (e: any) { toast.error(e.message); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const focusFile = previewFile ?? selectedFile;
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
        if (previewFile) { setPreviewFile(null); return; }
        if (selectedIds.size) { clearSelection(); return; }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size) {
        e.preventDefault(); onDeleteSelection(); return;
      }
      // Space = Quick Look (Mac Finder style)
      if (e.key === " " && focusFile && !quickLook) {
        e.preventDefault(); setQuickLook(focusFile); return;
      }
      // Enter = open / download
      if (e.key === "Enter" && focusFile) { e.preventDefault(); onDownload(focusFile); return; }
      // Single-key shortcuts (no modifier). Skip if user is selecting text,
      // so we never hijack standard copy/paste/selection flows.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((window.getSelection?.()?.toString().length ?? 0) > 0) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); setCheatsheetOpen(true); return; }
      if (e.key === "/") { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key.toLowerCase() === "n" && section === "my") { e.preventDefault(); setFolderDialog(true); return; }
      if (e.key.toLowerCase() === "u" && section === "my") { e.preventDefault(); fileInputRef.current?.click(); return; }
      if (e.key.toLowerCase() === "r" && focusFile) {
        e.preventDefault();
        setRenameTarget({ kind: "file", id: focusFile.id, name: focusFile.name });
        return;
      }
      if (e.key.toLowerCase() === "s" && focusFile) {
        e.preventDefault(); onStar(focusFile); return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFile, previewFile, selectedIds, quickLook, activeFiles, section]);

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
    if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list")) e.preventDefault();
  };

  // Create a shortcut file from a URL (e.g. Google Sheets / Docs / Slides).
  const handleAddLink = async (rawUrl: string, displayName?: string) => {
    if (!user) return;
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    if (!detectExternalLink(trimmed)) { toast.error("Not a valid URL"); return; }
    if (section !== "my") { toast.error("Switch to My Drive to add a link"); return; }
    try {
      const folderId = path[path.length - 1];
      await createExternalLink(user.id, folderId, trimmed, displayName);
      toast.success("Link added");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    if (section !== "my") { toast.error("Switch to My Drive to upload"); return; }

    // URL drop (Google Sheets / Docs / any web link).
    const uriList = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    const looksLikeUrl = uriList && /^https?:\/\//i.test(uriList.trim().split(/\s+/)[0] ?? "");
    if (looksLikeUrl && (!e.dataTransfer.files || e.dataTransfer.files.length === 0)) {
      const url = uriList.trim().split(/\s+/)[0];
      await handleAddLink(url);
      return;
    }

    // Prefer DataTransferItemList to preserve folder structure.
    const items = e.dataTransfer.items;
    if (items && items.length && typeof (items[0] as any).webkitGetAsEntry === "function") {
      const entries: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as any).webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length) {
        const collected = (await Promise.all(entries.map((en) => readEntries(en)))).flat();
        if (collected.length) { await handleUploadEntries(collected); return; }
      }
    }
    // Fallback: flat file list.
    handleUpload(e.dataTransfer.files);
  };


  const onColorFolder = async (f: FolderRow, color: string | null) => {
    try {
      await setFolderColor(f.id, color);
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const folderActions = {
    onShare: (f: FolderRow) => setShareTarget({ type: "folder", id: f.id, name: f.name, ownerId: f.owner_id }),
    onRename: (f: FolderRow) => setRenameTarget({ kind: "folder", id: f.id, name: f.name }),
    onMove: (f: FolderRow) => setMoveTarget({ kind: "folder", id: f.id, name: f.name, currentParent: f.parent_id }),
    onDelete: onDeleteFolder,
    onColor: onColorFolder,
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

  // -------- Drag & drop: move items into a folder --------
  const buildDragPayload = (kind: "file" | "folder", id: string): DragPayload => {
    if (kind === "file") {
      const ids = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      return { files: ids, folders: Array.from(selectedFolderIds) };
    }
    const ids = selectedFolderIds.has(id) ? Array.from(selectedFolderIds) : [id];
    return { files: Array.from(selectedIds), folders: ids };
  };

  const dropIntoFolder = async (targetFolderId: string | null, payload: DragPayload) => {
    const fileIds = payload.files;
    const folderIds = payload.folders.filter((id) => id !== targetFolderId);
    if (!fileIds.length && !folderIds.length) return;
    const total = fileIds.length + folderIds.length;
    const tid = toast.loading(`Moving ${total} item${total > 1 ? "s" : ""}…`);
    try {
      await Promise.all([
        ...fileIds.map((id) => moveFile(id, targetFolderId)),
        ...folderIds.map((id) => moveFolder(id, targetFolderId)),
      ]);
      clearSelection();
      invalidate();
      toast.success(`Moved ${total} item${total > 1 ? "s" : ""}`, { id: tid });
    } catch (e: any) {
      toast.error(e.message ?? "Move failed", { id: tid });
    }
  };

  // -------- Bottom selection bar actions --------
  const selectionStarAll = async () => {
    const files = activeFiles.filter((f) => selectedIds.has(f.id));
    for (const f of files) await onStar(f);
  };
  const selectionDownloadAll = async () => {
    const files = activeFiles.filter((f) => selectedIds.has(f.id));
    for (const f of files) await onDownload(f);
  };
  const selectionShareSingle = () => {
    if (selectedIds.size === 1 && selectedFolderIds.size === 0) {
      const f = activeFiles.find((x) => selectedIds.has(x.id));
      if (f) fileActions.onShare(f);
    } else if (selectedFolderIds.size === 1 && selectedIds.size === 0) {
      const f = activeFolders.find((x) => selectedFolderIds.has(x.id));
      if (f) folderActions.onShare(f);
    }
  };
  const selectionMoveAll = () => {
    // For multi-move we reuse the MoveDialog by setting one target — keeps UX simple.
    if (selectedIds.size === 1 && selectedFolderIds.size === 0) {
      const f = activeFiles.find((x) => selectedIds.has(x.id));
      if (f) fileActions.onMove(f);
      return;
    }
    if (selectedFolderIds.size === 1 && selectedIds.size === 0) {
      const f = activeFolders.find((x) => selectedFolderIds.has(x.id));
      if (f) folderActions.onMove(f);
      return;
    }
    toast.info("Drag & drop the selection into a folder to move multiple items.");
  };
  const selectionDeleteAll = async () => {
    const fileTargets = activeFiles.filter((f) => selectedIds.has(f.id));
    const folderTargets = activeFolders.filter((f) => selectedFolderIds.has(f.id));
    const total = fileTargets.length + folderTargets.length;
    if (!total) return;
    const tid = toast.loading(`Moving ${total} to Trash…`);
    try {
      await Promise.all([
        ...fileTargets.map((f) => trashFile(f.id)),
        ...folderTargets.map((f) => trashFolder(f.id)),
      ]);
      clearSelection();
      invalidate();
      toast.success(`${total} item${total > 1 ? "s" : ""} moved to Trash`, { id: tid });
    } catch (e: any) {
      toast.error(e.message, { id: tid });
    }
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
      <input
        ref={folderInputRef} type="file" className="hidden"
        // @ts-expect-error non-standard but widely supported
        webkitdirectory="" directory=""
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const entries = files.map((f) => {
            const rel = (f as any).webkitRelativePath as string | undefined;
            const segs = rel ? rel.split("/") : [f.name];
            const relPath = segs.slice(0, -1);
            return { file: f, relPath };
          });
          handleUploadEntries(entries);
          e.target.value = "";
        }}
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
          <NavItem icon={<Trash2 className="size-4" />} label="Trash" active={section === "trash"} onClick={() => setSection("trash")} />
        </nav>

        <SavedSearchesSection
          userId={user.id}
          onApply={(q, f) => { setActiveQuery(q); setActiveFilters(f); }}
        />




        <div className="mt-auto p-4 space-y-2">
          <Button className="w-full" onClick={() => fileInputRef.current?.click()}>
            <Upload /> Upload files
          </Button>
          <Button variant="outline" className="w-full" onClick={() => folderInputRef.current?.click()} disabled={section !== "my"}>
            <Upload /> Upload folder
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setFolderDialog(true)} disabled={section !== "my"}>
            <FolderPlus /> New folder
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setLinkDialogOpen(true)} disabled={section !== "my"}>
            <LinkIcon /> Add link
          </Button>

          <StorageIndicator userId={user.id} />

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
        {/* Top header: centered search bar */}
        <header className="h-16 border-b border-hairline flex items-center px-6 bg-background gap-4">
          <div className="flex-1 min-w-0" />
          <div className="flex-[2] flex justify-center px-4">
            <SearchBar
              onOpenFile={(f) => { setSection("my"); setQuickLook(f); }}
              onOpenFolder={(f) => { setSection("my"); setPath([null, f.id]); }}
              onActiveQueryChange={(q, filters) => { setActiveQuery(q); setActiveFilters(filters); }}
            />
          </div>
          <div className="flex-1 flex items-center justify-end gap-2 shrink-0">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter here…"
                className="w-36 pl-8 h-8 text-xs bg-surface-2 border-0"
              />
            </div>
            <div className="flex items-center bg-surface-2 p-0.5 rounded-md ring-1 ring-hairline">
              <ViewToggle active={view === "columns"} onClick={() => setView("columns")} icon={<Columns3 className="size-3.5" />} />
              <ViewToggle active={view === "list"} onClick={() => setView("list")} icon={<ListIcon className="size-3.5" />} />
              <ViewToggle active={view === "grid"} onClick={() => setView("grid")} icon={<Grid3x3 className="size-3.5" />} />
            </div>
            <button
              onClick={() => setDark((v) => !v)}
              className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2"
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
        </header>

        {section !== "trash" && !activeQuery && (
          <div className="border-b border-hairline bg-background px-6 py-2.5 flex items-center">
            <Breadcrumb section={section} path={path} setPath={setPath} />
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {section === "trash" ? (
            <TrashView userId={user.id} invalidate={invalidate} />
          ) : activeQuery ? (
            <SearchResults
              query={activeQuery}
              filters={activeFilters}
              onOpenFile={(f) => setQuickLook(f)}
              onOpenFolder={(f) => { setActiveQuery(""); setSection("my"); setPath([null, f.id]); }}
              onClear={() => setActiveQuery("")}
            />

          ) : view === "columns" ? (
            <ColumnsView
              userId={user.id}
              section={section}
              path={path}
              setPath={setPath}
              search={search}
              selectedIds={selectedIds}
              selectedFolderIds={selectedFolderIds}
              onFileClick={handleFileClick}
              onFileOpen={(f) => setQuickLook(f)}
              onBackgroundClick={clearSelection}
              onActiveFiles={setActiveFiles}
              onActiveFolders={setActiveFolders}
              folderActions={folderActions}
              fileActions={fileActions}
              onToggleFolderSelected={toggleFolderInSelection}
              onToggleFileSelected={(id) => {
                setSelectedIds((prev) => {
                  const n = new Set(prev);
                  if (n.has(id)) n.delete(id); else n.add(id);
                  return n;
                });
              }}
              buildDragPayload={buildDragPayload}
              onDropIntoFolder={dropIntoFolder}
              onDropExternalFiles={async (parentFolderId, files) => {
                if (section !== "my") { toast.error("Switch to My Drive to upload"); return; }
                // Push current path so upload goes to the right column.
                const idx = path.indexOf(parentFolderId);
                if (idx > 0) {
                  // already on this path — fine
                } else if (parentFolderId !== null) {
                  setPath((p) => (p[p.length - 1] === parentFolderId ? p : [...p, parentFolderId]));
                }
                const arr = Array.from(files).filter((f) => f.size > 0 || f.type !== "");
                if (!arr.length) return;
                const entries = arr.map((f) => ({ file: f, relPath: [] }));
                // Upload to specific folder regardless of current path:
                const tid = toast.loading(`Uploading ${entries.length} item${entries.length > 1 ? "s" : ""}…`);
                let done = 0;
                for (const { file } of entries) {
                  try { await uploadFile(user.id, parentFolderId, file); done++; toast.loading(`Uploading… ${done}/${entries.length}`, { id: tid }); }
                  catch (e: any) { toast.error(`${file.name}: ${e?.message ?? "Failed"}`); }
                }
                invalidate();
                toast.success(`Uploaded ${done}/${entries.length}`, { id: tid });
              }}
            />
          ) : (
            <FlatView
              userId={user.id}
              section={section}
              path={path}
              search={search}
              mode={view}
              selectedIds={selectedIds}
              selectedFolderIds={selectedFolderIds}
              onFileClick={handleFileClick}
              onFileOpen={(f) => setQuickLook(f)}
              onOpenFolder={(f) => setPath([...path, f.id])}
              onBackgroundClick={clearSelection}
              onActiveFiles={setActiveFiles}
              onActiveFolders={setActiveFolders}
              folderActions={folderActions}
              fileActions={fileActions}
              onToggleFolderSelected={toggleFolderInSelection}
              onToggleFileSelected={(id) => {
                setSelectedIds((prev) => {
                  const n = new Set(prev);
                  if (n.has(id)) n.delete(id); else n.add(id);
                  return n;
                });
              }}
              buildDragPayload={buildDragPayload}
              onDropIntoFolder={dropIntoFolder}
            />
          )}

          {previewFile && (
            <PreviewPane
              file={previewFile}
              currentUserId={user.id}
              onClose={() => setPreviewFile(null)}
              onShare={fileActions.onShare}
              onDelete={onDeleteFile}
              onToggleStar={onStar}
              onDownload={onDownload}
              onCopyLink={onCopyLink}
              onOpenFullscreen={(f) => setQuickLook(f)}
            />
          )}
        </div>

        <SelectionBar
          fileCount={selectedIds.size}
          folderCount={selectedFolderIds.size}
          onClear={clearSelection}
          onMove={selectionMoveAll}
          onDownload={selectionDownloadAll}
          onDelete={selectionDeleteAll}
          onStar={selectionStarAll}
          onShare={selectionShareSingle}
        />
      </main>

      <QuickLook
        file={quickLook}
        siblings={activeFiles}
        onNavigate={(f) => setQuickLook(f)}
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

      <AddLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onSubmit={async (url, name) => { await handleAddLink(url, name); setLinkDialogOpen(false); }}
      />

      <RenameDialog
        open={!!renameTarget}
        onOpenChange={(v) => !v && setRenameTarget(null)}
        initial={renameTarget?.name ?? ""}
        title={renameTarget?.kind === "folder" ? "Rename folder" : "Rename file"}
        lockExtension={renameTarget?.kind === "file"}
        existingNames={
          renameTarget?.kind === "folder"
            ? activeFolders.map((f) => f.name)
            : activeFiles.map((f) => f.name)
        }
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
          { id: "upload-folder", label: "Upload folder", icon: <Upload className="size-4" />, onSelect: () => folderInputRef.current?.click() },
          { id: "new-folder", label: "New folder", icon: <FolderPlus className="size-4" />, onSelect: () => setFolderDialog(true) },
          { id: "my", label: "Go to My Drive", icon: <Folder className="size-4" />, onSelect: () => setSection("my") },
          { id: "shared-with-me", label: "Go to Shared with me", icon: <Inbox className="size-4" />, onSelect: () => setSection("shared-with-me") },
          { id: "shared-by-me", label: "Go to Shared by me", icon: <Send className="size-4" />, onSelect: () => setSection("shared-by-me") },
          { id: "recent", label: "Go to Recent", icon: <Clock className="size-4" />, onSelect: () => setSection("recent") },
          { id: "starred", label: "Go to Starred", icon: <Star className="size-4" />, onSelect: () => setSection("starred") },
          { id: "theme", label: dark ? "Switch to light mode" : "Switch to dark mode", icon: dark ? <Sun className="size-4" /> : <Moon className="size-4" />, onSelect: () => setDark((v) => !v), keywords: "theme dark light" },
          { id: "help", label: "Keyboard shortcuts", icon: <Search className="size-4" />, onSelect: () => setCheatsheetOpen(true), keywords: "help shortcuts cheatsheet" },
        ]}
      />

      <CheatsheetDialog open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
    </div>
  );
}

function StorageIndicator({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["drive", "storage", userId],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase
        .from("files")
        .select("size")
        .eq("owner_id", userId)
        .is("deleted_at", null);
      if (error) throw error;
      const used = (data ?? []).reduce((a, b) => a + (b.size ?? 0), 0);
      return { used, count: data?.length ?? 0 };
    },
  });
  const QUOTA = 15 * 1024 * 1024 * 1024; // 15 GB
  const used = data?.used ?? 0;
  const pct = Math.min(100, (used / QUOTA) * 100);
  return (
    <div className="px-2 py-2 space-y-1.5">
      <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(QUOTA)}</span>
      </div>
    </div>
  );
}

type FolderActions = {
  onShare: (f: FolderRow) => void;
  onRename: (f: FolderRow) => void;
  onMove: (f: FolderRow) => void;
  onDelete: (f: FolderRow) => void;
  onColor: (f: FolderRow, color: string | null) => void;
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
  const current = folder.color ?? null;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => actions.onShare(folder)}><Share2 className="size-3.5 mr-2" /> Share</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onRename(folder)}><Pencil className="size-3.5 mr-2" /> Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onMove(folder)}><Move className="size-3.5 mr-2" /> Move…</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger><Palette className="size-3.5 mr-2" /> Color</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56 p-2">
            <div className="grid grid-cols-7 gap-1.5">
              {FOLDER_PALETTE.map((c) => {
                const active = (current ?? DEFAULT_FOLDER_COLOR).toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    title={c.name}
                    onClick={() => actions.onColor(folder, c.value)}
                    className={cn(
                      "size-6 rounded-full grid place-items-center ring-1 ring-black/10 hover:scale-110 transition-transform",
                      active && "ring-2 ring-foreground/70",
                    )}
                    style={{ backgroundColor: c.value }}
                  >
                    {active && <Check className="size-3 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer flex-1">
                <input
                  type="color"
                  value={current ?? DEFAULT_FOLDER_COLOR}
                  onChange={(e) => actions.onColor(folder, e.target.value)}
                  className="size-6 rounded cursor-pointer border-0 bg-transparent p-0"
                />
                Custom…
              </label>
              {current && (
                <button
                  onClick={() => actions.onColor(folder, null)}
                  className="text-[11px] px-2 py-1 rounded-md hover:bg-surface-2 text-muted-foreground"
                >
                  Reset
                </button>
              )}
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
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
  const isRoot = path.length <= 1;
  return (
    <nav
      className="flex items-center gap-1 text-base font-medium min-w-0 w-full overflow-x-auto scrollbar-none whitespace-nowrap"
      style={{ scrollbarWidth: "none" }}
    >
      <button
        onClick={() => setPath([null])}
        className={cn(
          "px-2 py-1 rounded-md hover:bg-surface-2 shrink-0",
          isRoot ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {sectionLabel}
      </button>
      {path.slice(1).map((id, i) => {
        const isLast = i === path.length - 2;
        return (
          <span key={id} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="size-4 text-muted-foreground/60 shrink-0" />
            <button
              onClick={() => setPath(path.slice(0, i + 2))}
              className={cn(
                "px-2 py-1 rounded-md hover:bg-surface-2 max-w-[240px] truncate",
                isLast ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FolderName id={id!} />
            </button>
          </span>
        );
      })}
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

type LassoItem = { id: string; kind: "file" | "folder"; el: HTMLElement };

function useLasso(
  containerRef: React.RefObject<HTMLDivElement | null>,
  getItems: () => LassoItem[],
  onSelect: (files: Set<string>, folders: Set<string>, additive: boolean) => void,
  onBackgroundClick?: () => void,
) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const getItemsRef = useRef(getItems);
  const onSelectRef = useRef(onSelect);
  const onBgRef = useRef(onBackgroundClick);
  useEffect(() => { getItemsRef.current = getItems; });
  useEffect(() => { onSelectRef.current = onSelect; });
  useEffect(() => { onBgRef.current = onBackgroundClick; });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0, startY = 0, startClientX = 0, startClientY = 0;
    let additive = false, active = false, moved = false;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-drive-item], button, a, input, [role='menuitem']")) return;
      const cRect = el.getBoundingClientRect();
      startX = e.clientX - cRect.left + el.scrollLeft;
      startY = e.clientY - cRect.top + el.scrollTop;
      startClientX = e.clientX;
      startClientY = e.clientY;
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
      setRect({
        x: Math.min(startX, curX),
        y: Math.min(startY, curY),
        w: Math.abs(curX - startX),
        h: Math.abs(curY - startY),
      });
      const vx1 = Math.min(e.clientX, startClientX);
      const vy1 = Math.min(e.clientY, startClientY);
      const vx2 = Math.max(e.clientX, startClientX);
      const vy2 = Math.max(e.clientY, startClientY);
      const hitFiles = new Set<string>();
      const hitFolders = new Set<string>();
      for (const it of getItemsRef.current()) {
        const r = it.el.getBoundingClientRect();
        if (r.right >= vx1 && r.left <= vx2 && r.bottom >= vy1 && r.top <= vy2) {
          if (it.kind === "file") hitFiles.add(it.id);
          else hitFolders.add(it.id);
        }
      }
      onSelectRef.current(hitFiles, hitFolders, additive);
    };

    const onUp = () => {
      if (!active) return;
      if (!moved) onBgRef.current?.();
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
  }, [containerRef]);

  return rect;
}

/* ---------------- Columns view (Finder-style) ---------------- */

type SharedViewProps = {
  userId: string;
  section: Section;
  path: (string | null)[];
  search: string;
  selectedIds: Set<string>;
  selectedFolderIds: Set<string>;
  previewFileId?: string | null;
  onFileClick: (f: FileRow, e: React.MouseEvent) => void;
  onFileOpen: (f: FileRow) => void;
  onBackgroundClick: () => void;
  onActiveFiles: (files: FileRow[]) => void;
  onActiveFolders: (folders: FolderRow[]) => void;
  folderActions: FolderActions;
  fileActions: FileActions;
  onToggleFolderSelected: (id: string) => void;
  onToggleFileSelected: (id: string) => void;
  buildDragPayload: (kind: "file" | "folder", id: string) => DragPayload;
  onDropIntoFolder: (targetFolderId: string | null, payload: DragPayload) => void | Promise<void>;
};

function ColumnsView(props: SharedViewProps & {
  setPath: (p: (string | null)[]) => void;
  onDropExternalFiles: (parentFolderId: string | null, files: FileList) => void | Promise<void>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const depth = props.path.length;

  // Auto-scroll to the newly opened (rightmost) column whenever the path grows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Wait one frame so the new column has been laid out.
    const id = requestAnimationFrame(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [depth]);

  // Track which arrows to show (hide when at an edge).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth - 1;
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [depth]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(288, el.clientWidth * 0.6), behavior: "smooth" });
  };

  return (
    <div className="flex-1 relative min-w-0">
      <div
        ref={scrollerRef}
        className="absolute inset-0 flex overflow-x-auto thin-scroll bg-background"
        style={{ scrollBehavior: "smooth" }}
      >
        {props.path.map((parentId, d) => (
          <Column
            key={`${d}-${parentId ?? "root"}`}
            {...props}
            parentId={parentId}
            depth={d}
            isLast={d === props.path.length - 1}
          />
        ))}
      </div>
      {edges.left && (
        <button
          onClick={() => scrollBy(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 size-8 grid place-items-center rounded-full bg-background/90 backdrop-blur ring-1 ring-hairline text-muted-foreground hover:text-foreground hover:bg-background shadow-architect"
          title="Scroll left"
          aria-label="Scroll columns left"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {edges.right && (
        <button
          onClick={() => scrollBy(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 size-8 grid place-items-center rounded-full bg-background/90 backdrop-blur ring-1 ring-hairline text-muted-foreground hover:text-foreground hover:bg-background shadow-architect"
          title="Scroll right"
          aria-label="Scroll columns right"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

function Column(props: SharedViewProps & {
  parentId: string | null;
  depth: number;
  isLast: boolean;
  setPath: (p: (string | null)[]) => void;
  onDropExternalFiles: (parentFolderId: string | null, files: FileList) => void | Promise<void>;
}) {
  const {
    userId, section, parentId, depth, isLast, path, setPath, search,
    selectedIds, selectedFolderIds, previewFileId,
    onFileClick, onFileOpen, onBackgroundClick, onActiveFiles, onActiveFolders,
    folderActions, fileActions,
    onToggleFolderSelected, onToggleFileSelected,
    buildDragPayload, onDropIntoFolder, onDropExternalFiles,
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

  // Publish active files and folders only from the last (deepest) column.
  useEffect(() => {
    if (isLast) { onActiveFiles(files); onActiveFolders(folders); }
  }, [isLast, data]);

  // Track drop hover state for this column (root drop = upload into this parent).
  const [columnDropOver, setColumnDropOver] = useState(false);
  const dropCounter = useRef(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, { el: HTMLElement; kind: "file" | "folder" }>>(new Map());
  const lassoBaseFiles = useRef<Set<string>>(new Set());
  const lassoBaseFolders = useRef<Set<string>>(new Set());

  const lassoRect = useLasso(
    scrollRef,
    () => Array.from(itemRefs.current.entries()).map(([id, v]) => ({ id, kind: v.kind, el: v.el })),
    (hitFiles, hitFolders, additive) => {
      if (!isLast) return;
      const mergedFiles = additive
        ? new Set([...lassoBaseFiles.current, ...hitFiles])
        : hitFiles;
      const mergedFolders = additive
        ? new Set([...lassoBaseFolders.current, ...hitFolders])
        : hitFolders;
      window.dispatchEvent(new CustomEvent("drive-lasso-set", { detail: { ids: Array.from(mergedFiles) } }));
      window.dispatchEvent(new CustomEvent("drive-lasso-set-folders", { detail: { ids: Array.from(mergedFolders) } }));
    },
    () => { if (isLast) onBackgroundClick(); },
  );

  // Capture base selection at lasso start
  useEffect(() => {
    const onDown = () => {
      lassoBaseFiles.current = new Set(selectedIds);
      lassoBaseFolders.current = new Set(selectedFolderIds);
    };
    const el = scrollRef.current;
    el?.addEventListener("mousedown", onDown);
    return () => el?.removeEventListener("mousedown", onDown);
  }, [selectedIds, selectedFolderIds]);

  return (
    <div
      className={cn(
        "w-72 border-r border-hairline flex flex-col shrink-0 bg-background transition-colors",
        columnDropOver && "bg-primary/5 ring-1 ring-primary/40",
      )}
      onDragEnter={(e) => {
        if (!isExternalFileDrag(e) && !isDriveDrag(e)) return;
        e.preventDefault();
        dropCounter.current++;
        setColumnDropOver(true);
      }}
      onDragLeave={(e) => {
        if (!isExternalFileDrag(e) && !isDriveDrag(e)) return;
        e.preventDefault();
        dropCounter.current--;
        if (dropCounter.current <= 0) { dropCounter.current = 0; setColumnDropOver(false); }
      }}
      onDragOver={(e) => {
        if (!isExternalFileDrag(e) && !isDriveDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isDriveDrag(e) ? "move" : "copy";
      }}
      onDrop={async (e) => {
        if (isDriveDrag(e)) {
          e.preventDefault(); e.stopPropagation();
          dropCounter.current = 0; setColumnDropOver(false);
          const payload = getDragPayload(e);
          if (payload) await onDropIntoFolder(parentId, payload);
          return;
        }
        if (isExternalFileDrag(e)) {
          e.preventDefault(); e.stopPropagation();
          dropCounter.current = 0; setColumnDropOver(false);
          await onDropExternalFiles(parentId, e.dataTransfer.files);
        }
      }}
    >
      <div className="px-3 h-8 flex items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground border-b border-hairline/60">
        {depth === 0 ? "Root" : "Subfolder"}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll p-2 relative select-none">
        {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}

        {/* Folders — compact rectangular rows */}
        {folders.length > 0 && (
          <div className="space-y-0.5 mb-3">
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                isActive={activeChildId === f.id}
                isSelected={selectedFolderIds.has(f.id)}
                onOpen={() => { onBackgroundClick(); setPath([...path.slice(0, depth + 1), f.id]); }}
                onToggleSelected={() => onToggleFolderSelected(f.id)}
                folderActions={folderActions}
                buildDragPayload={buildDragPayload}
                onDropIntoFolder={onDropIntoFolder}
                registerRef={(el) => {
                  if (el) itemRefs.current.set(f.id, { el, kind: "folder" });
                  else itemRefs.current.delete(f.id);
                }}
              />
            ))}
          </div>
        )}

        {/* Files — compact list rows (Finder-style), NOT cards */}
        {files.length > 0 && (
          <div className="space-y-0.5">
            {files.map((f) => {
              const isSelected = selectedIds.has(f.id);
              const isPreview = previewFileId === f.id;
              return (
                <FileContextMenu key={f.id} file={f} actions={fileActions}>
                  <div
                    data-drive-item="file"
                    ref={(el) => {
                      if (el) itemRefs.current.set(f.id, { el, kind: "file" });
                      else itemRefs.current.delete(f.id);
                    }}
                    draggable
                    onDragStart={(e) => setDragPayload(e, buildDragPayload("file", f.id))}
                    onClick={(e) => { e.stopPropagation(); onFileClick(f, e); }}
                    onDoubleClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                    className={cn(
                      "w-full px-2 py-1.5 rounded-md flex items-center gap-2.5 text-left transition-colors group cursor-default",
                      isSelected
                        ? "bg-primary/15 ring-1 ring-primary/40"
                        : isPreview
                          ? "ring-2 ring-primary/70 bg-primary/5"
                          : "hover:bg-surface-2/60",
                    )}
                    title={f.name}
                  >
                    <SelectionCheckbox checked={isSelected} onToggle={() => onToggleFileSelected(f.id)} />
                    <div className="relative size-8 rounded-md overflow-hidden ring-1 ring-hairline bg-surface-2 shrink-0">
                      <Thumbnail file={f} className="size-full" iconClassName="size-4 opacity-70" />
                      <FileTypeBadge
                        name={f.name}
                        mime={f.mime_type}
                        className="absolute -bottom-0.5 -right-0.5 size-4 rounded ring-1 ring-background"
                        iconClassName="size-2.5"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate leading-tight">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
                    </div>
                  </div>
                </FileContextMenu>
              );
            })}
          </div>
        )}


        {!isLoading && folders.length === 0 && files.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            {columnDropOver ? "Drop to add here" : "Empty"}
          </div>
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

function FolderRow({
  folder, isActive, isSelected, onOpen, onToggleSelected,
  folderActions, buildDragPayload, onDropIntoFolder, registerRef,
}: {
  folder: FolderRow;
  isActive: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelected: () => void;
  folderActions: FolderActions;
  buildDragPayload: (kind: "file" | "folder", id: string) => DragPayload;
  onDropIntoFolder: (targetFolderId: string | null, payload: DragPayload) => void | Promise<void>;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <FolderContextMenu folder={folder} actions={folderActions}>
      <div
        data-drive-item="folder"
        ref={registerRef}
        draggable
        onDragStart={(e) => setDragPayload(e, buildDragPayload("folder", folder.id))}
        onDragEnter={(e) => { if (isDriveDrag(e) || isExternalFileDrag(e)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
        onDragOver={(e) => { if (isDriveDrag(e) || isExternalFileDrag(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = isDriveDrag(e) ? "move" : "copy"; } }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          if (!isDriveDrag(e)) return;
          e.preventDefault(); e.stopPropagation();
          setOver(false);
          const payload = getDragPayload(e);
          if (payload) await onDropIntoFolder(folder.id, payload);
        }}
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className={cn(
          "w-full px-2.5 py-2 text-sm rounded-md flex items-center justify-between gap-2 transition-colors text-left group cursor-pointer",
          over ? "bg-primary/15 ring-1 ring-primary/50"
            : isActive ? "bg-surface-2 ring-1 ring-hairline"
            : isSelected ? "bg-primary/10 ring-1 ring-primary/30"
            : "hover:bg-surface-2/60",
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <SelectionCheckbox checked={isSelected} onToggle={onToggleSelected} />
          <FolderIcon color={folder.color} className="size-5" />
          <span className="truncate font-medium">{folder.name}</span>
        </div>
        <ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0" />
      </div>
    </FolderContextMenu>
  );
}


/* ---------------- List / Grid view ---------------- */

function FlatView(props: SharedViewProps & {
  mode: "list" | "grid";
  onOpenFolder: (f: FolderRow) => void;
}) {
  const {
    userId, section, path, search, mode,
    selectedIds, selectedFolderIds, previewFileId,
    onFileClick, onFileOpen, onOpenFolder, onBackgroundClick,
    onActiveFiles, onActiveFolders,
    folderActions, fileActions,
    onToggleFolderSelected, onToggleFileSelected,
    buildDragPayload, onDropIntoFolder,
  } = props;
  // onActiveFolders published below alongside files; other props used in rows.
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

  useEffect(() => { onActiveFiles(files); onActiveFolders(folders); }, [data]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, { el: HTMLElement; kind: "file" | "folder" }>>(new Map());
  const lassoBaseFiles = useRef<Set<string>>(new Set());
  const lassoBaseFolders = useRef<Set<string>>(new Set());

  const lassoRect = useLasso(
    scrollRef,
    () => Array.from(itemRefs.current.entries()).map(([id, v]) => ({ id, kind: v.kind, el: v.el })),
    (hitFiles, hitFolders, additive) => {
      const mergedFiles = additive
        ? new Set([...lassoBaseFiles.current, ...hitFiles])
        : hitFiles;
      const mergedFolders = additive
        ? new Set([...lassoBaseFolders.current, ...hitFolders])
        : hitFolders;
      window.dispatchEvent(new CustomEvent("drive-lasso-set", { detail: { ids: Array.from(mergedFiles) } }));
      window.dispatchEvent(new CustomEvent("drive-lasso-set-folders", { detail: { ids: Array.from(mergedFolders) } }));
    },
    onBackgroundClick,
  );

  useEffect(() => {
    const onDown = () => {
      lassoBaseFiles.current = new Set(selectedIds);
      lassoBaseFolders.current = new Set(selectedFolderIds);
    };
    const el = scrollRef.current;
    el?.addEventListener("mousedown", onDown);
    return () => el?.removeEventListener("mousedown", onDown);
  }, [selectedIds, selectedFolderIds]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll bg-background relative select-none">
      {isLoading && <div className="p-8 text-sm text-muted-foreground">Loading…</div>}

      {mode === "list" && (
        <div className="divide-y divide-hairline">
          <div className="grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-9 items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground sticky top-0 bg-background z-10 border-b border-hairline">
            <span>Name</span><span>Size</span><span>Modified</span><span></span>
          </div>
          {folders.map((f) => {
            const isSel = selectedFolderIds.has(f.id);
            return (
              <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
                <FlatFolderRow
                  folder={f}
                  isSelected={isSel}
                  onOpen={() => onOpenFolder(f)}
                  onToggleSelected={() => onToggleFolderSelected(f.id)}
                  onShare={() => folderActions.onShare(f)}
                  buildDragPayload={buildDragPayload}
                  onDropIntoFolder={onDropIntoFolder}
                  registerRef={(el) => {
                    if (el) itemRefs.current.set(f.id, { el, kind: "folder" });
                    else itemRefs.current.delete(f.id);
                  }}
                />
              </FolderContextMenu>
            );
          })}
          {files.map((f) => {
            const isSelected = selectedIds.has(f.id);
            return (
              <FileContextMenu key={f.id} file={f} actions={fileActions}>
                <div
                  data-drive-item="file"
                  ref={(el) => { if (el) itemRefs.current.set(f.id, { el, kind: "file" }); else itemRefs.current.delete(f.id); }}
                  draggable
                  onDragStart={(e) => setDragPayload(e, buildDragPayload("file", f.id))}
                  onClick={(e) => { e.stopPropagation(); onFileClick(f, e); }}
                  onDoubleClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                  className={cn(
                    "w-full grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-11 items-center text-left text-sm cursor-default group",
                    isSelected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-surface-2/60",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SelectionCheckbox checked={isSelected} onToggle={() => onToggleFileSelected(f.id)} />
                    <div className="relative size-9 rounded-md overflow-hidden ring-1 ring-hairline bg-surface-2 shrink-0">
                      <Thumbnail file={f} className="size-full" iconClassName="size-4 opacity-70" />
                      <FileTypeBadge
                        name={f.name}
                        mime={f.mime_type}
                        className="absolute -bottom-0.5 -right-0.5 size-4 rounded ring-1 ring-background"
                        iconClassName="size-2.5"
                      />
                    </div>
                    <span className="truncate font-medium">{f.name}</span>
                  </div>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                  <span className="text-muted-foreground">{new Date(f.updated_at).toLocaleDateString()}</span>
                  <span></span>
                </div>
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
                {folders.map((f) => {
                  const isSel = selectedFolderIds.has(f.id);
                  return (
                    <FolderContextMenu key={f.id} folder={f} actions={folderActions}>
                      <GridFolderCard
                        folder={f}
                        isSelected={isSel}
                        onOpen={() => onOpenFolder(f)}
                        onToggleSelected={() => onToggleFolderSelected(f.id)}
                        buildDragPayload={buildDragPayload}
                        onDropIntoFolder={onDropIntoFolder}
                        registerRef={(el) => {
                          if (el) itemRefs.current.set(f.id, { el, kind: "folder" });
                          else itemRefs.current.delete(f.id);
                        }}
                      />
                    </FolderContextMenu>
                  );
                })}
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
                      <div
                        data-drive-item="file"
                        ref={(el) => { if (el) itemRefs.current.set(f.id, { el, kind: "file" }); else itemRefs.current.delete(f.id); }}
                        draggable
                        onDragStart={(e) => setDragPayload(e, buildDragPayload("file", f.id))}
                        onClick={(e) => { e.stopPropagation(); onFileClick(f, e); }}
                        onDoubleClick={(e) => { e.stopPropagation(); onFileOpen(f); }}
                        className={cn(
                          "rounded-lg ring-1 transition-all overflow-hidden flex flex-col text-left bg-surface group cursor-default relative",
                          isSelected ? "ring-2 ring-primary shadow-pane" : "ring-hairline hover:ring-foreground/20 hover:shadow-architect",
                        )}
                      >
                        <div className="aspect-square w-full bg-surface-2 relative overflow-hidden">
                          <Thumbnail file={f} className="size-full" iconClassName="size-10 opacity-70" />
                          <div className="absolute top-2 right-2">
                            <SelectionCheckbox checked={isSelected} onToggle={() => onToggleFileSelected(f.id)} />
                          </div>
                        </div>

                        <div className="p-2.5 border-t border-hairline bg-surface flex items-center gap-2">
                          <div className="text-sm font-medium truncate flex-1 min-w-0">{f.name}</div>
                          <FileTypeBadge
                            name={f.name}
                            mime={f.mime_type}
                            className="size-5 rounded shrink-0"
                            iconClassName="size-3"
                          />
                        </div>
                      </div>
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

function useFolderDropTarget(
  folderId: string,
  onDropIntoFolder: (targetFolderId: string | null, payload: DragPayload) => void | Promise<void>,
) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragEnter: (e: React.DragEvent) => {
        if (!isDriveDrag(e) && !isExternalFileDrag(e)) return;
        e.preventDefault(); e.stopPropagation();
        setOver(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!isDriveDrag(e) && !isExternalFileDrag(e)) return;
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = isDriveDrag(e) ? "move" : "copy";
      },
      onDragLeave: () => setOver(false),
      onDrop: async (e: React.DragEvent) => {
        if (!isDriveDrag(e)) return;
        e.preventDefault(); e.stopPropagation();
        setOver(false);
        const payload = getDragPayload(e);
        if (payload) await onDropIntoFolder(folderId, payload);
      },
    },
  };
}

function FlatFolderRow({
  folder, isSelected, onOpen, onToggleSelected, onShare,
  buildDragPayload, onDropIntoFolder, registerRef,
}: {
  folder: FolderRow;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelected: () => void;
  onShare: () => void;
  buildDragPayload: (kind: "file" | "folder", id: string) => DragPayload;
  onDropIntoFolder: (targetFolderId: string | null, payload: DragPayload) => void | Promise<void>;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const drop = useFolderDropTarget(folder.id, onDropIntoFolder);
  return (
    <div
      data-drive-item="folder"
      ref={registerRef}
      draggable
      onDragStart={(e) => setDragPayload(e, buildDragPayload("folder", folder.id))}
      {...drop.handlers}
      onDoubleClick={onOpen}
      onClick={onOpen}
      className={cn(
        "w-full grid grid-cols-[1fr_120px_140px_60px] gap-4 px-6 h-11 items-center text-left text-sm group cursor-pointer transition-colors",
        drop.over ? "bg-primary/15 ring-1 ring-primary/50"
          : isSelected ? "bg-primary/10 ring-1 ring-primary/30"
          : "hover:bg-surface-2/60",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <SelectionCheckbox checked={isSelected} onToggle={onToggleSelected} />
        <FolderIcon color={folder.color} className="size-5" />
        <span className="truncate font-medium">{folder.name}</span>
      </div>
      <span className="text-muted-foreground">—</span>
      <span className="text-muted-foreground">{new Date(folder.updated_at).toLocaleDateString()}</span>
      <span className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onShare(); }}>
        <Share2 className="size-3.5 text-muted-foreground hover:text-foreground" />
      </span>
    </div>
  );
}

function GridFolderCard({
  folder, isSelected, onOpen, onToggleSelected,
  buildDragPayload, onDropIntoFolder, registerRef,
}: {
  folder: FolderRow;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelected: () => void;
  buildDragPayload: (kind: "file" | "folder", id: string) => DragPayload;
  onDropIntoFolder: (targetFolderId: string | null, payload: DragPayload) => void | Promise<void>;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const drop = useFolderDropTarget(folder.id, onDropIntoFolder);
  return (
    <div
      data-drive-item="folder"
      ref={registerRef}
      draggable
      onDragStart={(e) => setDragPayload(e, buildDragPayload("folder", folder.id))}
      {...drop.handlers}
      onDoubleClick={onOpen}
      onClick={onOpen}
      className={cn(
        "h-12 rounded-lg ring-1 bg-surface transition-colors px-3 flex items-center gap-3 text-left cursor-pointer group",
        drop.over ? "ring-2 ring-primary bg-primary/10"
          : isSelected ? "ring-2 ring-primary/60"
          : "ring-hairline hover:bg-surface-2",
      )}
    >
      <SelectionCheckbox checked={isSelected} onToggle={onToggleSelected} />
      <FolderIcon color={folder.color} className="size-6" />
      <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
    </div>
  );
}



/* ---------------- Trash view ---------------- */

function TrashView({ userId, invalidate }: { userId: string; invalidate: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["drive", "trash", userId],
    queryFn: () => listTrash(userId),
  });

  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const total = folders.length + files.length;

  const onRestoreFile = async (f: FileRow) => {
    try { await restoreFile(f.id); invalidate(); toast.success(`"${f.name}" restored`); }
    catch (e: any) { toast.error(e.message); }
  };
  const onRestoreFolder = async (f: FolderRow) => {
    try { await restoreFolder(f.id); invalidate(); toast.success(`"${f.name}" restored`); }
    catch (e: any) { toast.error(e.message); }
  };
  const onPurgeFile = async (f: FileRow) => {
    if (!confirm(`Permanently delete "${f.name}"? This cannot be undone.`)) return;
    try { await deleteFile(f); invalidate(); toast.success("Deleted forever"); }
    catch (e: any) { toast.error(e.message); }
  };
  const onPurgeFolder = async (f: FolderRow) => {
    if (!confirm(`Permanently delete folder "${f.name}"? This cannot be undone.`)) return;
    try { await deleteFolder(f.id); invalidate(); toast.success("Deleted forever"); }
    catch (e: any) { toast.error(e.message); }
  };
  const onEmpty = async () => {
    if (!total) return;
    if (!confirm(`Empty Trash? ${total} item${total > 1 ? "s" : ""} will be permanently deleted.`)) return;
    try {
      await Promise.all([
        ...files.map((f) => deleteFile(f)),
        ...folders.map((f) => deleteFolder(f.id)),
      ]);
      invalidate();
      toast.success("Trash emptied");
    } catch (e: any) { toast.error(e.message); }
  };

  const daysSince = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  };

  return (
    <div className="flex-1 overflow-y-auto thin-scroll bg-background">
      <div className="px-6 py-4 border-b border-hairline flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Trash</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {total === 0 ? "Empty" : `${total} item${total > 1 ? "s" : ""} · auto-deleted after 30 days`}
          </div>
        </div>
        {total > 0 && (
          <Button size="sm" variant="destructive" onClick={onEmpty}>
            <Trash2 /> Empty Trash
          </Button>
        )}
      </div>

      {isLoading && <div className="p-8 text-sm text-muted-foreground">Loading…</div>}

      {!isLoading && total === 0 && (
        <div className="grid place-items-center py-24 text-center">
          <Trash2 className="size-10 text-muted-foreground/40 mb-3" />
          <div className="text-sm font-medium">Nothing in Trash</div>
          <div className="text-xs text-muted-foreground mt-1">Deleted files will appear here for 30 days.</div>
        </div>
      )}

      {total > 0 && (
        <div className="divide-y divide-hairline">
          <div className="grid grid-cols-[1fr_120px_160px_120px] gap-4 px-6 h-9 items-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground sticky top-0 bg-background z-10 border-b border-hairline">
            <span>Name</span><span>Size</span><span>Deleted</span><span className="text-right">Actions</span>
          </div>
          {folders.map((f) => (
            <div key={f.id} className="grid grid-cols-[1fr_120px_160px_120px] gap-4 px-6 h-12 items-center text-sm hover:bg-surface-2/40">
              <div className="flex items-center gap-3 min-w-0">
                <FolderIcon color={f.color} className="size-5" />
                <span className="truncate font-medium">{f.name}</span>
              </div>
              <span className="text-muted-foreground">—</span>
              <span className="text-muted-foreground">
                {f.deleted_at ? `${daysSince(f.deleted_at)}d ago · ${30 - daysSince(f.deleted_at)}d left` : "—"}
              </span>
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => onRestoreFolder(f)} className="h-7 px-2 rounded-md text-xs hover:bg-surface-2 inline-flex items-center gap-1.5" title="Restore">
                  <RotateCcw className="size-3" /> Restore
                </button>
                <button onClick={() => onPurgeFolder(f)} className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete forever">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
          {files.map((f) => (
            <div key={f.id} className="grid grid-cols-[1fr_120px_160px_120px] gap-4 px-6 h-12 items-center text-sm hover:bg-surface-2/40">
              <div className="flex items-center gap-3 min-w-0">
                <FileIcon name={f.name} mime={f.mime_type} className="size-8 rounded-md" />
                <span className="truncate font-medium">{f.name}</span>
              </div>
              <span className="text-muted-foreground">{formatBytes(f.size)}</span>
              <span className="text-muted-foreground">
                {f.deleted_at ? `${daysSince(f.deleted_at)}d ago · ${30 - daysSince(f.deleted_at)}d left` : "—"}
              </span>
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => onRestoreFile(f)} className="h-7 px-2 rounded-md text-xs hover:bg-surface-2 inline-flex items-center gap-1.5" title="Restore">
                  <RotateCcw className="size-3" /> Restore
                </button>
                <button onClick={() => onPurgeFile(f)} className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete forever">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

