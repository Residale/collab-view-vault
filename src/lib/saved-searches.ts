import { supabase } from "@/integrations/supabase/client";
import type { SearchFilters } from "@/components/drive/SearchBar";

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  created_at: string;
};

export async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from("saved_searches" as any)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SavedSearch[];
}

export async function createSavedSearch(
  userId: string,
  name: string,
  query: string,
  filters: SearchFilters,
): Promise<void> {
  const { error } = await supabase
    .from("saved_searches" as any)
    .insert({ user_id: userId, name, query, filters: filters as any });
  if (error) throw error;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from("saved_searches" as any).delete().eq("id", id);
  if (error) throw error;
}
