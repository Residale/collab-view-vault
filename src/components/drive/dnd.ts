// Lightweight HTML5 drag & drop helpers for Drive items.
// We use custom mime types so we never clash with external file drags.

export const DND_FILES = "application/x-drive-files";
export const DND_FOLDERS = "application/x-drive-folders";

export type DragPayload = { files: string[]; folders: string[] };

export function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  try {
    e.dataTransfer.setData(DND_FILES, JSON.stringify(payload.files));
    e.dataTransfer.setData(DND_FOLDERS, JSON.stringify(payload.folders));
    e.dataTransfer.effectAllowed = "move";
  } catch {
    // ignore
  }
}

export function getDragPayload(e: React.DragEvent): DragPayload | null {
  try {
    const filesRaw = e.dataTransfer.getData(DND_FILES);
    const foldersRaw = e.dataTransfer.getData(DND_FOLDERS);
    if (!filesRaw && !foldersRaw) return null;
    return {
      files: filesRaw ? JSON.parse(filesRaw) : [],
      folders: foldersRaw ? JSON.parse(foldersRaw) : [],
    };
  } catch {
    return null;
  }
}

export function isDriveDrag(e: React.DragEvent): boolean {
  const types = Array.from(e.dataTransfer.types ?? []);
  return types.includes(DND_FILES) || types.includes(DND_FOLDERS);
}

export function isExternalFileDrag(e: React.DragEvent): boolean {
  const types = Array.from(e.dataTransfer.types ?? []);
  return types.includes("Files") && !isDriveDrag(e);
}
