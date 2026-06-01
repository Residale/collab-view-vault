import { useEffect, useState } from "react";
import { fileKind, getSignedUrl, type FileRow, formatBytes } from "@/lib/drive-api";
import { Button } from "@/components/ui/button";
import { Download, Share2, Star, Trash2, X, Maximize2, Link2, MessageSquare } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { SheetPreview } from "./SheetPreview";
import { FileTagsEditor } from "./Tags";
import { CommentsSection } from "./CommentsSection";

export function PreviewPane({
  file,
  currentUserId,
  onClose,
  onShare, onDelete, onToggleStar, onDownload, onCopyLink, onOpenFullscreen,
}: {
  file: FileRow | null;
  currentUserId: string;
  onClose?: () => void;
  onShare: (f: FileRow) => void;
  onDelete: (f: FileRow) => void;
  onToggleStar: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
  onCopyLink?: (f: FileRow) => void;
  onOpenFullscreen?: (f: FileRow) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setTextContent(null);
    if (!file) return;
    let cancelled = false;
    getSignedUrl(file.storage_path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [file?.id]);

  const kind = file ? fileKind(file.mime_type, file.name) : "other";
  const isText = file && (kind === "doc" || kind === "code") &&
    /\.(txt|md|json|csv|tsv|log|js|ts|tsx|jsx|py|html|css|go|rs|xml|yml|yaml)$/i.test(file.name);

  useEffect(() => {
    if (!url || !isText) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => { if (!cancelled) setTextContent(t.slice(0, 200_000)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url, isText]);

  if (!file) return null;

  const isSheet = kind === "spreadsheet" || /\.(xlsx|xls|csv|tsv|ods)$/i.test(file.name);

  return (
    <div className="w-[440px] shrink-0 border-l border-hairline bg-surface-2 overflow-y-auto thin-scroll relative flex flex-col">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 size-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface ring-1 ring-hairline bg-surface-2"
          title="Close preview"
        >
          <X className="size-3.5" />
        </button>
      )}

      <div className="p-5 space-y-5">
        {/* Compact preview thumbnail (click to open fullscreen) */}
        <button
          type="button"
          onClick={() => onOpenFullscreen?.(file)}
          className="group w-full aspect-[4/3] bg-surface rounded-xl ring-1 ring-hairline grid place-items-center overflow-hidden relative cursor-zoom-in"
          title="Open fullscreen"
        >
          {url && kind === "image" && <img src={url} alt={file.name} className="size-full object-contain" />}
          {url && kind === "video" && <video src={url} className="size-full object-contain" muted />}
          {url && kind === "audio" && (
            <div className="p-6 w-full text-center">
              <FileIcon name={file.name} mime={file.mime_type} className="size-14 mx-auto" />
            </div>
          )}
          {url && kind === "pdf" && <iframe src={url} title={file.name} className="size-full pointer-events-none" />}
          {url && isSheet && <div className="size-full pointer-events-none overflow-hidden"><SheetPreview url={url} /></div>}
          {url && isText && textContent !== null && (
            <pre className="size-full overflow-hidden p-3 text-[10px] font-mono text-left whitespace-pre-wrap pointer-events-none">
              {textContent.slice(0, 1200)}
            </pre>
          )}
          {(!url || ["other", "archive", "doc"].includes(kind)) && !isText && (
            <div className="text-center">
              <FileIcon name={file.name} mime={file.mime_type} className="size-14 mx-auto mb-2" />
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Preview</p>
            </div>
          )}
          <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition bg-foreground/40 backdrop-blur-[2px]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background text-foreground text-xs font-medium ring-1 ring-hairline">
              <Maximize2 className="size-3.5" /> Open fullscreen
            </span>
          </div>
        </button>

        {/* Title */}
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight truncate">{file.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatBytes(file.size)} · Updated {new Date(file.updated_at).toLocaleDateString()}
          </p>
        </div>

        {/* Primary action buttons — large, prominent */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            onClick={() => onOpenFullscreen?.(file)}
            className="h-11 font-medium"
          >
            <Maximize2 /> Open
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => onShare(file)}
            className="h-11 font-medium"
          >
            <Share2 /> Share
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => onDownload(file)}
            className="h-11 font-medium"
          >
            <Download /> Download
          </Button>
          {onCopyLink && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => onCopyLink(file)}
              className="h-11 font-medium"
            >
              <Link2 /> Copy link
            </Button>
          )}
        </div>

        {/* Secondary actions */}
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onToggleStar(file)}>
            <Star className={file.starred ? "fill-current text-amber-500" : ""} />
            {file.starred ? "Starred" : "Star"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              document.getElementById(`comments-${file.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <MessageSquare /> Comment
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(file)} className="text-destructive ml-auto">
            <Trash2 />
          </Button>
        </div>

        <section className="space-y-5 pt-2">
          <div>
            <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">Information</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Meta label="Size" value={formatBytes(file.size)} />
              <Meta label="Type" value={file.mime_type || "—"} />
              <Meta label="Created" value={new Date(file.created_at).toLocaleDateString()} />
              <Meta label="Starred" value={file.starred ? "Yes" : "No"} />
            </dl>
          </div>

          <div>
            <FileTagsEditor fileId={file.id} userId={currentUserId} />
          </div>

          <div id={`comments-${file.id}`}>
            <CommentsSection fileId={file.id} currentUserId={currentUserId} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs mb-0.5">{label}</dt>
      <dd className="font-medium truncate">{value}</dd>
    </div>
  );
}
