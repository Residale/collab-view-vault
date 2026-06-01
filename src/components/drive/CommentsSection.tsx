import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addComment, deleteComment, listComments } from "@/lib/comments";

export function CommentsSection({ fileId, currentUserId }: { fileId: string; currentUserId: string }) {
  const qc = useQueryClient();
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", fileId],
    queryFn: () => listComments(fileId),
  });
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await addComment(fileId, currentUserId, text);
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", fileId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(false); }
  }

  async function remove(id: string) {
    try {
      await deleteComment(id);
      qc.invalidateQueries({ queryKey: ["comments", fileId] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
        <MessageSquare className="size-3" /> Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      <div className="space-y-3 mb-3 max-h-64 overflow-y-auto thin-scroll">
        {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!isLoading && comments.length === 0 && (
          <div className="text-xs text-muted-foreground">No comments yet.</div>
        )}
        {comments.map((c) => {
          const name = c.author?.display_name ?? c.author?.email ?? "Someone";
          const initial = (name[0] || "?").toUpperCase();
          const mine = c.author_id === currentUserId;
          return (
            <div key={c.id} className="flex gap-2 group">
              <div className="size-7 shrink-0 rounded-full bg-primary/15 text-primary grid place-items-center text-[11px] font-semibold">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{name}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                  {mine && (
                    <button
                      onClick={() => remove(c.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 items-end">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
          }}
          placeholder="Add a comment… (⌘⏎ to send)"
          rows={2}
          className="flex-1 resize-none rounded-md bg-surface ring-1 ring-hairline px-3 py-2 text-sm focus:outline-none focus:ring-primary"
        />
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="size-9 shrink-0 grid place-items-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
