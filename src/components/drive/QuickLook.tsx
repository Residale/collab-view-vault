import { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { fileKind, getSignedUrl, formatBytes, isExternalLink, externalUrl, type FileRow } from "@/lib/drive-api";
import { FileIcon } from "./FileIcon";
import { SheetPreview } from "./SheetPreview";
import { Button } from "@/components/ui/button";
import {
  Download, Share2, Star, X, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, RotateCcw, ExternalLink as ExternalIcon,
} from "lucide-react";

import { HighlightedText } from "./Highlight";

export function QuickLook({
  file,
  siblings = [],
  searchQuery,
  onNavigate,
  onClose,
  onDownload,
  onShare,
  onToggleStar,
}: {
  file: FileRow | null;
  siblings?: FileRow[];
  searchQuery?: string;
  onNavigate?: (f: FileRow) => void;
  onClose: () => void;
  onDownload: (f: FileRow) => void;
  onShare: (f: FileRow) => void;
  onToggleStar: (f: FileRow) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const imgWrapRef = useRef<HTMLDivElement | null>(null);

  const external = !!file && isExternalLink(file);
  const linkUrl = external && file ? externalUrl(file) : null;

  useEffect(() => {
    setUrl(null);
    setTextContent(null);
    setZoom(1);
    if (!file || external) return;
    let cancelled = false;
    getSignedUrl(file.storage_path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [file?.id, external]);

  const kind = file ? fileKind(file.mime_type, file.name) : "other";
  const isText = !!file && !external && (kind === "doc" || kind === "code") &&
    /\.(txt|md|json|csv|tsv|log|js|ts|tsx|jsx|py|html|css|go|rs|xml|yml|yaml)$/i.test(file.name);
  const isSheet = !!file && !external && (kind === "spreadsheet" || /\.(xlsx|xls|csv|tsv|ods)$/i.test(file.name));

  useEffect(() => {
    if (!url || !isText) return;
    let cancelled = false;
    fetch(url).then((r) => r.text()).then((t) => { if (!cancelled) setTextContent(t.slice(0, 200_000)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [url, isText]);

  const { prev, next } = useMemo(() => {
    if (!file || siblings.length < 2) return { prev: null, next: null };
    const idx = siblings.findIndex((s) => s.id === file.id);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: siblings[(idx - 1 + siblings.length) % siblings.length],
      next: siblings[(idx + 1) % siblings.length],
    };
  }, [file?.id, siblings]);

  useEffect(() => {
    if (!file) return;
    function onKey(e: KeyboardEvent) {
      if (onNavigate && e.key === "ArrowLeft" && prev) { e.preventDefault(); onNavigate(prev); return; }
      if (onNavigate && e.key === "ArrowRight" && next) { e.preventDefault(); onNavigate(next); return; }
      if (kind === "image") {
        if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom((z) => Math.min(8, z * 1.25)); }
        else if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom((z) => Math.max(0.25, z * 0.8)); }
        else if (e.key === "0") { e.preventDefault(); setZoom(1); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file?.id, prev, next, onNavigate, kind]);

  const isImage = kind === "image";
  const canZoom = isImage;

  const onWheelZoom = (e: React.WheelEvent) => {
    if (!canZoom) return;
    e.preventDefault();
    setZoom((z) => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  return (
    <DialogPrimitive.Root open={!!file} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 w-screen h-screen bg-background p-0 gap-0 overflow-hidden flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Title className="sr-only">{file?.name ?? "Preview"}</DialogPrimitive.Title>
          {file && (
            <>
              <div className="flex items-center justify-between px-5 h-14 border-b border-hairline bg-surface shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <FileIcon name={file.name} mime={file.mime_type} className="size-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatBytes(file.size)} · {new Date(file.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canZoom && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.25, z * 0.8))} title="Zoom out (-)">
                        <ZoomOut />
                      </Button>
                      <span className="text-[11px] tabular-nums text-muted-foreground w-12 text-center">
                        {Math.round(zoom * 100)}%
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} title="Zoom in (+)">
                        <ZoomIn />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setZoom(1)} title="Reset zoom (0)">
                        <RotateCcw />
                      </Button>
                      <div className="w-px h-6 bg-hairline mx-1" />
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onToggleStar(file)} title="Star">
                    <Star className={file.starred ? "fill-current text-amber-500" : ""} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onShare(file)} title="Share">
                    <Share2 />
                  </Button>
                  {external && linkUrl ? (
                    <Button size="sm" variant="default" onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")} title="Open in new tab">
                      <ExternalIcon /> Open
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => onDownload(file)} title="Open / Download">
                      <Download />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={onClose} title="Close (Esc)">
                    <X />
                  </Button>
                </div>
              </div>

              <div
                ref={imgWrapRef}
                onWheel={onWheelZoom}
                className="flex-1 bg-background grid place-items-center overflow-auto thin-scroll relative"
              >
                {onNavigate && prev && (
                  <button
                    onClick={() => onNavigate(prev)}
                    className="fixed left-4 top-1/2 -translate-y-1/2 z-20 size-12 grid place-items-center rounded-full bg-surface/90 backdrop-blur ring-1 ring-hairline text-foreground hover:bg-surface shadow-lg"
                    title="Previous (←)"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                )}
                {onNavigate && next && (
                  <button
                    onClick={() => onNavigate(next)}
                    className="fixed right-4 top-1/2 -translate-y-1/2 z-20 size-12 grid place-items-center rounded-full bg-surface/90 backdrop-blur ring-1 ring-hairline text-foreground hover:bg-surface shadow-lg"
                    title="Next (→)"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                )}
                {onNavigate && siblings.length > 1 && (
                  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-surface/90 backdrop-blur ring-1 ring-hairline text-xs text-muted-foreground shadow-lg">
                    {siblings.findIndex((s) => s.id === file.id) + 1} / {siblings.length}
                  </div>
                )}
                {external && linkUrl && (
                  <div className="size-full grid place-items-center p-10">
                    <div className="text-center max-w-md">
                      <FileIcon name={file.name} mime={file.mime_type} className="size-20 mx-auto mb-4" />
                      <div className="text-sm font-medium mb-1">{file.name}</div>
                      <div className="text-xs text-muted-foreground truncate mb-6">{linkUrl}</div>
                      <Button onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")}>
                        <ExternalIcon /> Open in new tab
                      </Button>
                    </div>
                  </div>
                )}
                {!external && !url && (
                  <div className="text-center">
                    <FileIcon name={file.name} mime={file.mime_type} className="size-14 mx-auto mb-3 opacity-60" />
                    <p className="text-xs text-muted-foreground">Loading preview…</p>
                  </div>
                )}
                {url && isImage && (
                  <img
                    src={url}
                    alt={file.name}
                    onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
                    className="select-none transition-transform duration-150 ease-out max-h-[calc(100vh-3.5rem)] max-w-full object-contain"
                    style={{ transform: `scale(${zoom})`, cursor: zoom > 1 ? "grab" : "zoom-in" }}
                    draggable={false}
                  />
                )}
                {url && kind === "video" && (
                  <video src={url} controls autoPlay className="max-h-[calc(100vh-3.5rem)] max-w-full" />
                )}
                {url && kind === "audio" && (
                  <div className="p-10 w-full max-w-md text-center">
                    <FileIcon name={file.name} mime={file.mime_type} className="size-20 mx-auto mb-6" />
                    <audio src={url} controls className="w-full" />
                  </div>
                )}
                {url && kind === "pdf" && (
                  <iframe src={url} title={file.name} className="size-full" />
                )}
                {url && isSheet && (
                  <div className="size-full overflow-auto thin-scroll p-4">
                    <SheetPreview url={url} />
                  </div>
                )}
                {url && isText && textContent !== null && (
                  <pre className="size-full overflow-auto thin-scroll p-6 text-xs font-mono text-left whitespace-pre-wrap bg-surface">
                    {textContent}
                  </pre>
                )}
                {url && kind === "doc" && !isText && (
                  <iframe
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
                    title={file.name} className="size-full"
                  />
                )}
                {url && (kind === "other" || kind === "archive") && (
                  <div className="text-center">
                    <FileIcon name={file.name} mime={file.mime_type} className="size-20 mx-auto mb-4" />
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-4">
                      No inline preview
                    </p>
                    <Button size="sm" onClick={() => onDownload(file)}>
                      <Download /> Download to view
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
