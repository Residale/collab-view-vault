import { useEffect, useState } from "react";
import { fileKind, getSignedUrl, type FileRow } from "@/lib/drive-api";
import { FileIcon } from "./FileIcon";
import { cn } from "@/lib/utils";

/**
 * Visual preview for a file. Renders the image/video frame for media,
 * a styled icon for everything else. Signed URLs are cached in-memory
 * for the session to avoid re-signing on every scroll.
 */
const urlCache = new Map<string, { url: string; expires: number }>();

async function cachedSignedUrl(path: string) {
  const cached = urlCache.get(path);
  const now = Date.now();
  if (cached && cached.expires > now + 60_000) return cached.url;
  const url = await getSignedUrl(path, 3600);
  urlCache.set(path, { url, expires: now + 3600_000 });
  return url;
}

export function Thumbnail({
  file,
  className,
  iconClassName,
}: {
  file: FileRow;
  className?: string;
  iconClassName?: string;
}) {
  const kind = fileKind(file.mime_type, file.name);
  const wantsImage = kind === "image" || kind === "video";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!wantsImage) return;
    let cancelled = false;
    cachedSignedUrl(file.storage_path)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.storage_path, wantsImage]);

  if (wantsImage && !failed) {
    return (
      <div className={cn("relative overflow-hidden bg-surface-2", className)}>
        {kind === "image" && url && (
          <img
            src={url}
            alt={file.name}
            loading="lazy"
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
        {!url && (
          <div className="size-full grid place-items-center">
            <FileIcon name={file.name} mime={file.mime_type} className={cn("opacity-60", iconClassName)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("grid place-items-center bg-surface-2", className)}>
      <FileIcon name={file.name} mime={file.mime_type} className={iconClassName} />
    </div>
  );
}
