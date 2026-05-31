import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RenameDialog({
  open, onOpenChange, initial, title, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: string;
  title: string;
  onSubmit: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setName(initial); }, [open, initial]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initial) { onOpenChange(false); return; }
    setBusy(true);
    try { await onSubmit(trimmed); onOpenChange(false); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf(".");
            if (dot > 0) e.target.setSelectionRange(0, dot);
            else e.target.select();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
