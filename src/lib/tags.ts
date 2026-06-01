import { supabase } from "@/integrations/supabase/client";

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export async function listTags(userId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags" as any)
    .select("*")
    .eq("user_id", userId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Tag[];
}

export async function createTag(userId: string, name: string, color: string): Promise<Tag> {
  const { data, error } = await supabase
    .from("tags" as any)
    .insert({ user_id: userId, name, color })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Tag;
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from("tags" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function listFileTagIds(fileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("file_tags" as any)
    .select("tag_id")
    .eq("file_id", fileId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.tag_id as string);
}

export async function attachTag(fileId: string, tagId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("file_tags" as any)
    .insert({ file_id: fileId, tag_id: tagId, user_id: userId });
  if (error) throw error;
}

export async function detachTag(fileId: string, tagId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("file_tags" as any)
    .delete()
    .eq("file_id", fileId)
    .eq("tag_id", tagId)
    .eq("user_id", userId);
  if (error) throw error;
}

export const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];
