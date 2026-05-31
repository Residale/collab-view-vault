import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listSharesFor, removeShare, searchUsersByEmail, shareTarget,
} from "@/lib/drive-api";
import { toast } from "sonner";
import { X } from "lucide-react";

export type ShareTargetInput = {
  type: "file" | "folder";
  id: string;
  name: string;
  ownerId: string;
};

export function ShareDialog({
  target, onClose,
}: { target: ShareTargetInput | null; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [perm, setPerm] = useState<"view" | "edit">("view");
  const [results, setResults] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!target) return;
    setShares(await listSharesFor(target.type, target.id));
  };

  useEffect(() => { refresh(); }, [target?.id]);

  useEffect(() => {
    if (!email || email.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setResults(await searchUsersByEmail(email));
    }, 200);
    return () => clearTimeout(t);
  }, [email]);

  const share = async (userId: string) => {
    if (!target) return;
    setBusy(true);
    try {
      await shareTarget({
        ownerId: target.ownerId, sharedWith: userId,
        targetType: target.type, targetId: target.id, permission: perm,
      });
      toast.success("Shared");
      setEmail("");
      setResults([]);
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{target?.name}"</DialogTitle>
          <DialogDescription>
            Invite teammates by email. They'll see this {target?.type} in "Shared with me".
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search by email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select value={perm} onValueChange={(v: any) => setPerm(v)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="view">Can view</SelectItem>
              <SelectItem value="edit">Can edit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {results.length > 0 && (
          <div className="border border-hairline rounded-md divide-y divide-hairline overflow-hidden">
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => share(u.id)}
                disabled={busy}
                className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{u.display_name ?? u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <span className="text-xs text-muted-foreground">Invite</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-2">
          <h4 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
            People with access
          </h4>
          {shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Only you for now.</p>
          ) : (
            <ul className="space-y-1.5">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{s.profiles?.display_name ?? s.profiles?.email}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{s.permission}</span>
                  </div>
                  <button
                    onClick={async () => { await removeShare(s.id); refresh(); }}
                    className="text-muted-foreground hover:text-destructive p-1"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
