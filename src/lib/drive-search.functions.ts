import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Index a file (extract text + save) ----------
export const indexFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: file, error } = await supabase
      .from("files")
      .select("id, name, mime_type, storage_path, owner_id")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error) throw error;
    if (!file || file.owner_id !== userId) throw new Error("Not allowed");

    const { extractTextFromStorage } = await import("./drive-search.server");
    const text = await extractTextFromStorage(file.storage_path, file.name, file.mime_type);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("files")
      .update({ content_text: text ?? "" })
      .eq("id", file.id);

    return { indexed: !!text, chars: text?.length ?? 0 };
  });

// ---------- Search ----------
const searchInput = z.object({
  q: z.string().min(1).max(200),
  types: z.array(z.enum(["image", "video", "audio", "pdf", "doc", "spreadsheet", "code", "archive", "other"])).optional(),
  modifiedAfter: z.string().datetime().optional(),
  modifiedBefore: z.string().datetime().optional(),
  sizeMin: z.number().int().min(0).optional(),
  sizeMax: z.number().int().min(0).optional(),
  starred: z.boolean().optional(),
  folderId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type DriveSearchResult = {
  files: Array<{
    id: string;
    name: string;
    mime_type: string | null;
    size: number;
    storage_path: string;
    folder_id: string | null;
    starred: boolean;
    updated_at: string;
    created_at: string;
    owner_id: string;
    snippet: string | null;
  }>;
  folders: Array<{
    id: string;
    name: string;
    parent_id: string | null;
    updated_at: string;
    owner_id: string;
  }>;
};

const MIME_FILTERS: Record<string, { mimes?: string[]; exts?: string[] }> = {
  image: { mimes: ["image/"] },
  video: { mimes: ["video/"] },
  audio: { mimes: ["audio/"] },
  pdf: { mimes: ["application/pdf"], exts: ["pdf"] },
  doc: { exts: ["doc", "docx", "pages", "rtf", "odt"] },
  spreadsheet: { exts: ["xls", "xlsx", "csv", "tsv", "ods", "numbers"] },
  code: { exts: ["js", "ts", "tsx", "jsx", "json", "py", "html", "css", "go", "rs", "java", "c", "cpp", "rb", "php", "sh", "xml", "yml", "yaml"] },
  archive: { exts: ["zip", "rar", "7z", "tar", "gz"] },
};

export const searchDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => searchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const q = data.q.trim();

    // ---- Files: tsv match OR name ILIKE
    let filesQ = supabase
      .from("files")
      .select("id, name, mime_type, size, storage_path, folder_id, starred, updated_at, created_at, owner_id, content_text")
      .or(`name.ilike.%${q.replace(/[%_]/g, " ")}%,search_tsv.fts.${q.split(/\s+/).filter(Boolean).join(" & ")}`)
      .limit(data.limit);

    if (data.modifiedAfter) filesQ = filesQ.gte("updated_at", data.modifiedAfter);
    if (data.modifiedBefore) filesQ = filesQ.lte("updated_at", data.modifiedBefore);
    if (data.sizeMin != null) filesQ = filesQ.gte("size", data.sizeMin);
    if (data.sizeMax != null) filesQ = filesQ.lte("size", data.sizeMax);
    if (data.starred) filesQ = filesQ.eq("starred", true);
    if (data.folderId !== undefined) {
      if (data.folderId === null) filesQ = filesQ.is("folder_id", null);
      else filesQ = filesQ.eq("folder_id", data.folderId);
    }

    const { data: filesData, error: fErr } = await filesQ;
    if (fErr) throw fErr;

    let files = filesData ?? [];

    // Client-side type filter
    if (data.types && data.types.length) {
      files = files.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        return data.types!.some((t) => {
          const def = MIME_FILTERS[t];
          if (!def) return false;
          if (def.mimes?.some((m) => (f.mime_type ?? "").startsWith(m))) return true;
          if (def.exts?.includes(ext)) return true;
          return false;
        });
      });
    }

    // Build snippet from content_text
    const lq = q.toLowerCase();
    const filesOut = files.map((f) => {
      let snippet: string | null = null;
      if (f.content_text) {
        const idx = f.content_text.toLowerCase().indexOf(lq);
        if (idx >= 0) {
          const start = Math.max(0, idx - 50);
          const end = Math.min(f.content_text.length, idx + lq.length + 100);
          snippet = (start > 0 ? "…" : "") + f.content_text.slice(start, end) + (end < f.content_text.length ? "…" : "");
        }
      }
      const { content_text, ...rest } = f as any;
      return { ...rest, snippet };
    });

    // ---- Folders: name match only
    const { data: folders, error: foErr } = await supabase
      .from("folders")
      .select("id, name, parent_id, updated_at, owner_id")
      .ilike("name", `%${q}%`)
      .limit(20);
    if (foErr) throw foErr;

    return { files: filesOut, folders: folders ?? [] } as DriveSearchResult;
  });

// ---------- Search history ----------
export const recordSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Delete prior dupes then insert
    await supabase.from("search_history").delete().eq("user_id", userId).eq("query", data.query);
    await supabase.from("search_history").insert({ user_id: userId, query: data.query });
    // Trim to last 20
    const { data: rows } = await supabase
      .from("search_history")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(20, 1000);
    if (rows && rows.length) {
      await supabase.from("search_history").delete().in("id", rows.map((r) => r.id));
    }
    return { ok: true };
  });

export const getRecentSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("search_history")
      .select("query, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8);
    return (data ?? []) as Array<{ query: string; created_at: string }>;
  });

// ---------- Per-file snippets (for preview highlighting) ----------
export const getFileSnippets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      fileId: z.string().uuid(),
      query: z.string().min(1).max(200),
      max: z.number().int().min(1).max(20).default(5),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("files")
      .select("id, content_text")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error) throw error;
    const text = row?.content_text ?? "";
    if (!text) return { snippets: [] as string[] };

    const q = data.query.trim().toLowerCase();
    const lower = text.toLowerCase();
    const snippets: string[] = [];
    let from = 0;
    while (snippets.length < data.max) {
      const idx = lower.indexOf(q, from);
      if (idx < 0) break;
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + q.length + 120);
      snippets.push(
        (start > 0 ? "…" : "") +
          text.slice(start, end).replace(/\s+/g, " ").trim() +
          (end < text.length ? "…" : ""),
      );
      from = idx + q.length;
    }
    return { snippets };
  });
