import { supabase } from "@/integrations/supabase/client";

export type Comment = {
  id: string;
  file_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author?: { display_name: string | null; email: string | null; avatar_url: string | null };
};

export async function listComments(fileId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments" as any)
    .select("*")
    .eq("file_id", fileId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Comment[];
  if (rows.length === 0) return rows;
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .in("id", authorIds);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({ ...r, author: map.get(r.author_id) as any }));
}

export async function addComment(fileId: string, authorId: string, body: string): Promise<Comment> {
  const { data, error } = await supabase
    .from("comments" as any)
    .insert({ file_id: fileId, author_id: authorId, body })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Comment;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("comments" as any).delete().eq("id", id);
  if (error) throw error;
}
