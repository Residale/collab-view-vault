import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fileKind, getSignedUrl, formatBytes, type FileRow } from "@/lib/drive-api";
import { FileIcon } from "./FileIcon";
import { SheetPreview } from "./SheetPreview";
import { Button } from "@/components/ui/button";
import { Download, Share2, Star, ExternalLink, X } from "lucide-react";

export function QuickLook({
  file,
  onClose,
  onDownload,
  onShare,
  onToggleStar,
}: {
  file: FileRow | null;
  onClose: () => void;
  onDownload: (f: FileRow) => void;
  onShare: (f: FileRow) => void;
  onToggleStar: (f: FileRow) => void;
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
  const isText = !!file && (kind === "doc" || kind === "code") &&
    /\.(txt|md|json|csv|tsv|log|js|ts|tsx|jsx|py|html|css|go|rs|xml|yml|yaml)$/i.test(file.name);
  const isSheet = !!file && (kind === "spreadsheet" || /\.(xlsx|xls|csv|tsv|ods)$/i.test(file.name));

  useEffect(() => {
    if (!url || !isText) return;
    let cancelled = false;
    fetch(url).then((r) => r.text()).then((t) => { if (!cancelled) setTextContent(t.slice(0, 200_000)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [url, isText]);

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-[min(1100px,92vw)] w-full p-0 gap-0 overflow-hidden bg-surface border-hairline"
        style={{ maxHeight: "88vh" }}
      >
        {file && (
          <>
            <div className="flex items-center justify-between px-5 h-12 border-b border-hairline bg-surface-2 shrink-0">
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
                <Button size="sm" variant="ghost" onClick={() => onToggleStar(file)} title="Star">
                  <Star className={file.starred ? "fill-current" : ""} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onShare(file)} title="Share">
                  <Share2 />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDownload(file)} title="Open / Download">
                  <ExternalLink />
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose} title="Close (Esc)">
                  <X />
                </Button>
              </div>
            </div>

            <div className="bg-background grid place-items-center overflow-hidden" style={{ height: "calc(88vh - 3rem)" }}>
              {!url && (
                <div className="text-center">
                  <FileIcon name={file.name} mime={file.mime_type} className="size-14 mx-auto mb-3 opacity-60" />
                  <p className="text-xs text-muted-foreground">Loading preview…</p>
                </div>
              )}
              {url && kind === "image" && (
                <img src={url} alt={file.name} className="max-h-full max-w-full object-contain" />
              )}
              {url && kind === "video" && (
                <video src={url} controls autoPlay className="max-h-full max-w-full" />
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
      </DialogContent>
    </Dialog>
  );
}
