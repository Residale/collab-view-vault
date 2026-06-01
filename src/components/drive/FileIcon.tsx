import { cn } from "@/lib/utils";
import { fileKind, type FileKind } from "@/lib/drive-api";
import {
  FileText, Image as ImageIcon, Film, Music, FileSpreadsheet,
  FileCode, FileArchive, File as FileGeneric, Presentation,
  Palette, Type, BookOpen, AppWindow, Database, Link as LinkIcon,
} from "lucide-react";

type Style = {
  Icon: React.ComponentType<{ className?: string }>;
  /** Solid (filled) badge background + white icon. Google-Drive style. */
  solid: string;
  /** Soft tinted variant for inline icons in dense lists. */
  soft: string;
  label: string;
};

const STYLES: Record<FileKind, Style> = {
  image:        { Icon: ImageIcon,      solid: "bg-violet-500 text-white",  soft: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",   label: "IMG" },
  video:        { Icon: Film,           solid: "bg-rose-500 text-white",    soft: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",           label: "VID" },
  audio:        { Icon: Music,          solid: "bg-fuchsia-500 text-white", soft: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300", label: "AUD" },
  pdf:          { Icon: FileText,       solid: "bg-red-600 text-white",     soft: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",               label: "PDF" },
  spreadsheet:  { Icon: FileSpreadsheet,solid: "bg-emerald-600 text-white", soft: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", label: "XLS" },
  presentation: { Icon: Presentation,   solid: "bg-amber-500 text-white",   soft: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",       label: "PPT" },
  doc:          { Icon: FileText,       solid: "bg-blue-600 text-white",    soft: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",           label: "DOC" },
  code:         { Icon: FileCode,       solid: "bg-slate-700 text-white",   soft: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",      label: "CODE" },
  archive:      { Icon: FileArchive,    solid: "bg-stone-600 text-white",   soft: "bg-stone-100 text-stone-700 dark:bg-stone-500/15 dark:text-stone-300",      label: "ZIP" },
  design:       { Icon: Palette,        solid: "bg-pink-500 text-white",    soft: "bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",           label: "PSD" },
  font:         { Icon: Type,           solid: "bg-indigo-500 text-white",  soft: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",   label: "FNT" },
  ebook:        { Icon: BookOpen,       solid: "bg-orange-500 text-white",  soft: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",   label: "BOOK" },
  executable:   { Icon: AppWindow,      solid: "bg-zinc-700 text-white",    soft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",          label: "APP" },
  data:         { Icon: Database,       solid: "bg-cyan-600 text-white",    soft: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",           label: "DATA" },
  other:        { Icon: FileGeneric,    solid: "bg-zinc-500 text-white",    soft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",          label: "FILE" },
};

export function getFileStyle(name: string, mime: string | null) {
  return STYLES[fileKind(mime, name)];
}

/**
 * Soft tinted square icon used inline in dense lists (column / list view).
 */
export function FileIcon({ name, mime, className }: { name: string; mime: string | null; className?: string }) {
  const s = getFileStyle(name, mime);
  const Icon = s.Icon;
  return (
    <div className={cn("size-8 rounded-md grid place-items-center shrink-0", s.soft, className)}>
      <Icon className="size-4" />
    </div>
  );
}

/**
 * Solid Google-Drive-style colored badge. Designed to overlay on top
 * of grid thumbnails (top-left corner) so the file type is always
 * identifiable at a glance regardless of preview content.
 */
export function FileTypeBadge({
  name, mime, className, iconClassName, withLabel = false,
}: { name: string; mime: string | null; className?: string; iconClassName?: string; withLabel?: boolean }) {
  const s = getFileStyle(name, mime);
  const Icon = s.Icon;
  return (
    <div
      className={cn(
        "rounded-md grid place-items-center shadow-sm ring-1 ring-black/5 shrink-0",
        s.solid,
        withLabel ? "px-1.5 h-6 gap-1" : "size-6",
        className,
      )}
      title={s.label}
    >
      <Icon className={cn("size-3.5", iconClassName)} />
      {withLabel && <span className="text-[9px] font-semibold tracking-wide">{s.label}</span>}
    </div>
  );
}
