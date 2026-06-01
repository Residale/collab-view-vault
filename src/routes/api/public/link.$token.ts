import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/link/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || token.length < 8) {
          return new Response("Invalid link", { status: 400 });
        }

        const { data: link, error } = await supabaseAdmin
          .from("public_links")
          .select("file_id, expires_at, allow_download")
          .eq("token", token)
          .maybeSingle();

        if (error || !link) {
          return new Response("Link not found", { status: 404 });
        }
        if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
          return new Response("Link expired", { status: 410 });
        }

        const { data: file, error: fileErr } = await supabaseAdmin
          .from("files")
          .select("storage_path, name, mime_type")
          .eq("id", link.file_id)
          .is("deleted_at", null)
          .maybeSingle();

        if (fileErr || !file) {
          return new Response("File no longer available", { status: 404 });
        }

        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from("drive")
          .createSignedUrl(file.storage_path, 60 * 10, {
            download: link.allow_download ? file.name : undefined,
          });

        if (signErr || !signed) {
          return new Response("Could not generate link", { status: 500 });
        }

        return new Response(null, {
          status: 302,
          headers: { Location: signed.signedUrl },
        });
      },
    },
  },
});
