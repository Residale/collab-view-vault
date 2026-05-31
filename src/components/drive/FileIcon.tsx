import { cn } from "@/lib/utils";
import { fileKind } from "@/lib/drive-api";
import {
  FileText, Image as ImageIcon, Film, Music, FileSpreadsheet,
  FileCode, FileArchive, File as FileGeneric,
} from "lucide-react";

export function FileIcon({ name, mime, className }: { name: string; mime: string | null; className?: string }) {
  const k = fileKind(mime, name);
  const map = {
    image: { Icon: ImageIcon, color: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300" },
    video: { Icon: Film, color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300" },
    audio: { Icon: Music, color: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300" },
    pdf: { Icon: FileText, color: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300" },
    spreadsheet: { Icon: FileSpreadsheet, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" },
    doc: { Icon: FileText, color: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" },
    code: { Icon: FileCode, color: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
    archive: { Icon: FileArchive, color: "bg-stone-100 text-stone-600 dark:bg-stone-500/10 dark:text-stone-300" },
    other: { Icon: FileGeneric, color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-300" },
  }[k];
  const Icon = map.Icon;
  return (
    <div className={cn("size-8 rounded-md grid place-items-center shrink-0", map.color, className)}>
      <Icon className="size-4" />
    </div>
  );
}
