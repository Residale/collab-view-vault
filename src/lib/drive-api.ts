import { supabase } from "@/integrations/supabase/client";
import { getDriveSignedUrl } from "./drive-preview.functions";
import { indexFile } from "./drive-search.functions";

export type FolderRow = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  color?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type FileRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size: number;
  starred: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};



export type Section = "my" | "shared-with-me" | "shared-by-me" | "recent" | "starred" | "trash";

export async function listFolders(parentId: string | null, ownerId: string) {
  let q = supabase.from("folders").select("*").eq("owner_id", ownerId).is("deleted_at", null).order("name");
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FolderRow[];
}

export async function listFiles(folderId: string | null, ownerId: string) {
  let q = supabase.from("files").select("*").eq("owner_id", ownerId).is("deleted_at", null).order("name");
  q = folderId === null ? q.is("folder_id", null) : q.eq("folder_id", folderId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FileRow[];
}

export async function listSharedWithMe(userId: string) {
  const { data: shares, error } = await supabase
    .from("shares").select("*").eq("shared_with", userId);
  if (error) throw error;
  const fileIds = shares!.filter(s => s.target_type === "file").map(s => s.target_id);
  const folderIds = shares!.filter(s => s.target_type === "folder").map(s => s.target_id);
  const [filesRes, foldersRes] = await Promise.all([
    fileIds.length ? supabase.from("files").select("*").in("id", fileIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
    folderIds.length ? supabase.from("folders").select("*").in("id", folderIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    files: (filesRes.data ?? []) as FileRow[],
    folders: (foldersRes.data ?? []) as FolderRow[],
  };
}

export async function listSharedByMe(userId: string) {
  const { data: shares, error } = await supabase
    .from("shares").select("*").eq("owner_id", userId);
  if (error) throw error;
  const fileIds = [...new Set(shares!.filter(s => s.target_type === "file").map(s => s.target_id))];
  const folderIds = [...new Set(shares!.filter(s => s.target_type === "folder").map(s => s.target_id))];
  const [filesRes, foldersRes] = await Promise.all([
    fileIds.length ? supabase.from("files").select("*").in("id", fileIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
    folderIds.length ? supabase.from("folders").select("*").in("id", folderIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    files: (filesRes.data ?? []) as FileRow[],
    folders: (foldersRes.data ?? []) as FolderRow[],
    shares: shares!,
  };
}

export async function listRecent(userId: string) {
  const { data, error } = await supabase
    .from("files").select("*").eq("owner_id", userId).is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as FileRow[];
}

export async function listStarred(userId: string) {
  const { data, error } = await supabase
    .from("files").select("*").eq("owner_id", userId).eq("starred", true).is("deleted_at", null).order("name");
  if (error) throw error;
  return (data ?? []) as FileRow[];
}

export async function listTrash(userId: string) {
  const [files, folders] = await Promise.all([
    supabase.from("files").select("*").eq("owner_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("folders").select("*").eq("owner_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
  ]);
  if (files.error) throw files.error;
  if (folders.error) throw folders.error;
  return {
    files: (files.data ?? []) as FileRow[],
    folders: (folders.data ?? []) as FolderRow[],
  };
}


export async function createFolder(ownerId: string, parentId: string | null, name: string) {
  const { data, error } = await supabase.from("folders").insert({
    owner_id: ownerId, parent_id: parentId, name,
  }).select().single();
  if (error) throw error;
  return data as FolderRow;
}

// Storage keys must be ASCII-safe (Supabase rejects accents, parens, etc).
function sanitizeStorageName(name: string) {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "") || "file";
}

export async function uploadFile(userId: string, folderId: string | null, file: File) {
  const fileId = crypto.randomUUID();
  const path = `${userId}/${fileId}-${sanitizeStorageName(file.name)}`;
  const { error: upErr } = await supabase.storage.from("drive").upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type || undefined,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from("files").insert({
    id: fileId,
    owner_id: userId,
    folder_id: folderId,
    name: file.name,
    storage_path: path,
    mime_type: file.type || null,
    size: file.size,
  }).select().single();
  if (error) throw error;
  // Fire-and-forget text indexing (PDF/DOCX/text/code)
  indexFile({ data: { fileId: data.id } }).catch((e) => console.warn("indexFile failed", e));
  return data as FileRow;
}

export async function getSignedUrl(path: string, expires = 3600) {
  return getDriveSignedUrl({ data: { path, expires } });
}

// Soft-delete: mark deleted_at. Storage object kept until permanent purge.
export async function trashFile(id: string) {
  const { error } = await supabase.from("files")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function trashFolder(id: string) {
  const { error } = await supabase.from("folders")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function restoreFile(id: string) {
  const { error } = await supabase.from("files").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function restoreFolder(id: string) {
  const { error } = await supabase.from("folders").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

// Permanent deletion (used from Trash view or auto-purge).
export async function deleteFile(file: FileRow) {
  await supabase.storage.from("drive").remove([file.storage_path]);
  const { error } = await supabase.from("files").delete().eq("id", file.id);
  if (error) throw error;
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleStar(file: FileRow) {
  const { error } = await supabase.from("files")
    .update({ starred: !file.starred }).eq("id", file.id);
  if (error) throw error;
}

export async function renameFile(id: string, name: string) {
  const { error } = await supabase.from("files").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function renameFolder(id: string, name: string) {
  const { error } = await supabase.from("folders").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function moveFile(id: string, folderId: string | null) {
  const { error } = await supabase.from("files").update({ folder_id: folderId }).eq("id", id);
  if (error) throw error;
}

export async function moveFolder(id: string, parentId: string | null) {
  if (id === parentId) throw new Error("Cannot move a folder into itself");
  const { error } = await supabase.from("folders").update({ parent_id: parentId }).eq("id", id);
  if (error) throw error;
}


export async function listAllFolders(ownerId: string) {
  const { data, error } = await supabase
    .from("folders").select("*").eq("owner_id", ownerId).is("deleted_at", null).order("name");
  if (error) throw error;
  return (data ?? []) as FolderRow[];
}

export async function searchAll(ownerId: string, query: string) {
  const q = `%${query}%`;
  const [files, folders] = await Promise.all([
    supabase.from("files").select("*").eq("owner_id", ownerId).is("deleted_at", null).ilike("name", q).limit(20),
    supabase.from("folders").select("*").eq("owner_id", ownerId).is("deleted_at", null).ilike("name", q).limit(20),
  ]);
  return {
    files: (files.data ?? []) as FileRow[],
    folders: (folders.data ?? []) as FolderRow[],
  };
}


export async function searchUsersByEmail(query: string) {
  const { data, error } = await supabase
    .from("profiles").select("id, email, display_name, avatar_url")
    .ilike("email", `%${query}%`).limit(8);
  if (error) throw error;
  return data ?? [];
}

export async function shareTarget(opts: {
  ownerId: string;
  sharedWith: string;
  targetType: "file" | "folder";
  targetId: string;
  permission: "view" | "edit";
}) {
  const { error } = await supabase.from("shares").upsert({
    owner_id: opts.ownerId,
    shared_with: opts.sharedWith,
    target_type: opts.targetType,
    target_id: opts.targetId,
    permission: opts.permission,
  }, { onConflict: "shared_with,target_type,target_id" });
  if (error) throw error;
}

export async function listSharesFor(targetType: "file" | "folder", targetId: string) {
  const { data, error } = await supabase
    .from("shares")
    .select("id, permission, shared_with, profiles:shared_with(email, display_name, avatar_url)")
    .eq("target_type", targetType).eq("target_id", targetId);
  if (error) throw error;
  return data ?? [];
}

export async function removeShare(id: string) {
  const { error } = await supabase.from("shares").delete().eq("id", id);
  if (error) throw error;
}

export type FileKind =
  | "image" | "video" | "audio" | "pdf"
  | "spreadsheet" | "presentation" | "doc" | "code"
  | "archive" | "design" | "font" | "ebook"
  | "executable" | "data" | "other";

export function fileKind(mime: string | null, name: string): FileKind {
  const m = (mime ?? "").toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (m.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg","bmp","tiff","heic","heif","avif","ico"].includes(ext)) return "image";
  if (m.startsWith("video/") || ["mp4","mov","avi","mkv","webm","m4v","wmv","flv","mpeg","mpg","3gp"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["mp3","wav","flac","aac","ogg","m4a","wma","opus","aiff","alac"].includes(ext)) return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (["xls","xlsx","xlsm","csv","tsv","ods","numbers"].includes(ext)) return "spreadsheet";
  if (["ppt","pptx","pptm","odp","key"].includes(ext)) return "presentation";
  if (["doc","docx","odt","pages","rtf","txt","md","markdown","tex"].includes(ext)) return "doc";
  if (["js","mjs","cjs","ts","tsx","jsx","json","yaml","yml","xml","html","htm","css","scss","sass","less","py","rb","go","rs","java","kt","swift","c","cc","cpp","h","hpp","cs","php","sh","bash","zsh","sql","toml","ini","env","vue","svelte"].includes(ext)) return "code";
  if (["zip","rar","7z","tar","gz","bz2","xz","tgz","tbz","zst","iso","dmg"].includes(ext)) return "archive";
  if (["psd","ai","xd","fig","sketch","afdesign","afphoto","indd","eps"].includes(ext)) return "design";
  if (["ttf","otf","woff","woff2","eot"].includes(ext)) return "font";
  if (["epub","mobi","azw","azw3","fb2","djvu"].includes(ext)) return "ebook";
  if (["exe","msi","apk","app","deb","rpm","bin","dll"].includes(ext)) return "executable";
  if (["db","sqlite","sqlite3","parquet","arrow","ndjson","jsonl"].includes(ext)) return "data";
  return "other";
}

export function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}
