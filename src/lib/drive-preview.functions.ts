import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const signedUrlInput = z.object({
  path: z.string().min(1).max(1024),
  expires: z.number().int().min(60).max(60 * 60 * 24 * 7).default(3600),
});

export const getDriveSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => signedUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase
      .from("files")
      .select("id, storage_path")
      .eq("storage_path", data.path)
      .maybeSingle();

    if (error) throw error;
    if (!file) throw new Error("File not found or not accessible");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("drive")
      .createSignedUrl(file.storage_path, data.expires);

    if (signError) throw signError;
    return signed.signedUrl;
  });