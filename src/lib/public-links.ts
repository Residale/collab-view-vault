import { supabase } from "@/integrations/supabase/client";

export type PublicLink = {
  id: string;
  file_id: string;
  token: string;
  expires_at: string | null;
  allow_download: boolean;
  created_at: string;
};

function genToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

export function publicLinkUrl(token: string) {
  if (typeof window === "undefined") return `/api/public/link/${token}`;
  return `${window.location.origin}/api/public/link/${token}`;
}

export async function getPublicLink(fileId: string): Promise<PublicLink | null> {
  const { data, error } = await supabase
    .from("public_links" as any)
    .select("*")
    .eq("file_id", fileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PublicLink) ?? null;
}

export async function createPublicLink(opts: {
  fileId: string;
  userId: string;
  expiresInDays?: number | null;
  allowDownload?: boolean;
}): Promise<PublicLink> {
  const expires_at =
    opts.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString()
      : null;
  const token = genToken();
  const { data, error } = await supabase
    .from("public_links" as any)
    .insert({
      file_id: opts.fileId,
      created_by: opts.userId,
      token,
      expires_at,
      allow_download: opts.allowDownload ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as PublicLink;
}

export async function deletePublicLink(id: string): Promise<void> {
  const { error } = await supabase.from("public_links" as any).delete().eq("id", id);
  if (error) throw error;
}
