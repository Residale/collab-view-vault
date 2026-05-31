import { useEffect, useState } from "react";
import { fileKind, getSignedUrl, type FileRow, formatBytes } from "@/lib/drive-api";
import { Button } from "@/components/ui/button";
import { Download, Share2, Star, Trash2 } from "lucide-react";
import { FileIcon } from "./FileIcon";

export function PreviewPane({
  file,
  onShare, onDelete, onToggleStar, onDownload,
}: {
  file: FileRow | null;
  onShare: (f: FileRow) => void;
  onDelete: (f: FileRow) => void;
  onToggleStar: (f: FileRow) => void;
  onDownload: (f: FileRow) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!file) return;
    let cancelled = false;
    getSignedUrl(file.storage_path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [file?.id]);

  if (!file) {
    return (
      <div className="flex-1 grid place-items-center bg-surface-2 text-muted-foreground">
        <div className="text-center max-w-xs px-6">
          <div className="size-12 mx-auto rounded-full border-2 border-dashed border-hairline grid place-items-center mb-3 text-xl">+</div>
          <p className="text-sm">Select a file to view its preview, details and activity.</p>
        </div>
      </div>
    );
  }

  const k = fileKind(file.mime_type, file.name);

  return (
    <div className="flex-1 bg-surface-2 overflow-y-auto thin-scroll">
      <div className="p-8 max-w-2xl mx-auto">
        {/* Visual preview */}
        <div className="w-full aspect-[4/5] bg-surface rounded-xl ring-1 ring-hairline grid place-items-center mb-8 overflow-hidden shadow-pane">
          {url && k === "image" && <img src={url} alt={file.name} className="size-full object-contain" />}
          {url && k === "video" && <video src={url} controls className="size-full" />}
          {url && k === "audio" && (
            <div className="p-8 w-full">
              <FileIcon name={file.name} mime={file.mime_type} className="size-16 mx-auto mb-4" />
              <audio src={url} controls className="w-full" />
            </div>
          )}
          {url && k === "pdf" && <iframe src={url} title={file.name} className="size-full" />}
          {url && (k === "doc" || k === "spreadsheet") && (
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
              title={file.name} className="size-full"
            />
          )}
          {(!url || ["other", "code", "archive"].includes(k)) && (
            <div className="text-center">
              <FileIcon name={file.name} mime={file.mime_type} className="size-16 mx-auto mb-3" />
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">No inline preview</p>
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">{file.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Updated {new Date(file.updated_at).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={() => onToggleStar(file)}>
              <Star className={file.starred ? "fill-current" : ""} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDownload(file)}>
              <Download /> Download
            </Button>
            <Button size="sm" onClick={() => onShare(file)}>
              <Share2 /> Share
            </Button>
          </div>
        </div>

        <section className="space-y-6">
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
            <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">Actions</h3>
            <Button variant="outline" size="sm" onClick={() => onDelete(file)} className="text-destructive">
              <Trash2 /> Delete
            </Button>
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
