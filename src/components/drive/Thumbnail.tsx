import { useEffect, useState } from "react";
import { fileKind, getSignedUrl, isExternalLink, type FileRow } from "@/lib/drive-api";
import { FileIcon } from "./FileIcon";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

/**
 * Visual preview for a file. Image thumbnails are downscaled server-side
 * (Supabase image transform) so we never ship full-resolution photos just
 * to fill a 40px tile. `previewSize` caps the long edge in CSS pixels.
 */
const urlCache = new Map<string, { url: string; expires: number }>();

async function cachedSignedUrl(
  path: string,
  transform?: { width: number; height: number; resize?: "cover" | "contain" | "fill"; quality?: number },
) {
  const key = transform ? `${path}::${transform.width}x${transform.height}:${transform.resize ?? "cover"}` : path;
  const cached = urlCache.get(key);
  const now = Date.now();
  if (cached && cached.expires > now + 60_000) return cached.url;
  const url = await getSignedUrl(path, 3600, transform);
  urlCache.set(key, { url, expires: now + 3600_000 });
  return url;
}

export function Thumbnail({
  file,
  className,
  iconClassName,
  previewSize = 400,
}: {
  file: FileRow;
  className?: string;
  iconClassName?: string;
  /** Max width/height (px) for image thumbnails. Lower = faster. */
  previewSize?: number;
}) {
  const external = isExternalLink(file);
  const kind = fileKind(file.mime_type, file.name);
  const isSheet = !external && (kind === "spreadsheet" || /\.(xlsx|xls|csv|tsv|ods)$/i.test(file.name));
  const isText =
    !external &&
    (kind === "doc" || kind === "code") &&
    /\.(txt|md|json|csv|tsv|log|js|ts|tsx|jsx|py|html|css|go|rs|xml|yml|yaml)$/i.test(file.name);
  const wantsPreview = !external && (kind === "image" || kind === "video" || kind === "pdf" || isSheet || isText);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pdfImage, setPdfImage] = useState<string | null>(null);
  const [sheetRows, setSheetRows] = useState<string[][] | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!wantsPreview) return;
    let cancelled = false;
    setFailed(false);
    setPdfImage(null);
    setSheetRows(null);
    setTextPreview(null);
    // Only images benefit from the storage transform endpoint.
    const transform =
      kind === "image"
        ? { width: previewSize, height: previewSize, resize: "cover" as const, quality: 72 }
        : undefined;
    cachedSignedUrl(file.storage_path, transform)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file.storage_path, wantsPreview, kind, previewSize]);

  useEffect(() => {
    if (!url || kind !== "pdf") return;
    let cancelled = false;
    (async () => {
      try {
        const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.mjs?url"),
        ]);
        GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await getDocument({ url }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.45 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) setPdfImage(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, url]);

  useEffect(() => {
    if (!url || !isSheet) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const first = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(first, {
          header: 1,
          raw: false,
          defval: "",
        });
        if (!cancelled) setSheetRows((rows as string[][]).slice(0, 5));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSheet, url]);

  useEffect(() => {
    if (!url || !isText || isSheet) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setTextPreview(t.slice(0, 420));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSheet, isText, url]);

  if (wantsPreview && !failed) {
    return (
      <div className={cn("relative overflow-hidden bg-surface-2", className)}>
        {kind === "image" && url && (
          <img
            src={url}
            alt={file.name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        )}
        {kind === "video" && url && (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        )}
        {kind === "pdf" && pdfImage && (
          <img src={pdfImage} alt={file.name} className="size-full object-cover object-top" />
        )}
        {isSheet && sheetRows && <MiniSheet rows={sheetRows} />}
        {!isSheet && isText && textPreview && <MiniText text={textPreview} />}
        {!url && (
          <div className="size-full grid place-items-center">
            <FileIcon
              name={file.name}
              mime={file.mime_type}
              className={cn("opacity-60", iconClassName)}
            />
          </div>
        )}
      </div>
    );
  }

  return <DocumentThumb file={file} className={className} iconClassName={iconClassName} />;
}

function MiniSheet({ rows }: { rows: string[][] }) {
  const maxCols = Math.max(3, ...rows.map((row) => row.length));
  return (
    <div className="size-full overflow-hidden bg-surface p-1">
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${Math.min(maxCols, 4)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: Math.min(rows.length || 4, 5) }).flatMap((_, rowIndex) =>
          Array.from({ length: Math.min(maxCols, 4) }).map((__, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={cn(
                "h-2.5 truncate bg-surface-2 px-0.5 text-[5px] leading-3 text-foreground/70",
                rowIndex === 0 && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
              )}
            >
              {rows[rowIndex]?.[colIndex] ?? ""}
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function MiniText({ text }: { text: string }) {
  return (
    <div className="size-full overflow-hidden bg-surface p-1.5 text-left">
      <div className="space-y-1">
        {text
          .split(/\n+/)
          .filter(Boolean)
          .slice(0, 5)
          .map((line, index) => (
            <div
              key={`${index}-${line}`}
              className="h-1.5 truncate rounded-sm bg-foreground/15 text-[0px]"
            >
              {line}
            </div>
          ))}
      </div>
    </div>
  );
}

function DocumentThumb({
  file,
  className,
  iconClassName,
}: {
  file: FileRow;
  className?: string;
  iconClassName?: string;
}) {
  const ext = file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE";
  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-surface-2", className)}>
      <div className="absolute inset-1 rounded-sm bg-surface shadow-architect" />
      <div className="absolute left-2 right-2 top-2 space-y-1 opacity-70">
        <div className="h-1 rounded bg-foreground/25" />
        <div className="h-1 rounded bg-foreground/15" />
        <div className="h-1 rounded bg-foreground/15" />
      </div>
      <div className="relative grid place-items-center gap-0.5">
        <FileIcon
          name={file.name}
          mime={file.mime_type}
          className={cn("bg-surface/80", iconClassName)}
        />
        <span className="text-[7px] font-mono font-semibold text-muted-foreground">{ext}</span>
      </div>
    </div>
  );
}
