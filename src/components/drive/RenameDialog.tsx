import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Rename dialog. For files (`lockExtension=true`) the extension is shown but
 * never editable, matching macOS / Windows behaviour. Names that collide with
 * an existing sibling are blocked with an inline error.
 */
export function RenameDialog({
  open, onOpenChange, initial, title, onSubmit,
  lockExtension = false,
  existingNames = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: string;
  title: string;
  onSubmit: (name: string) => Promise<void> | void;
  lockExtension?: boolean;
  /** Sibling names in the same folder. Used to block duplicates. */
  existingNames?: string[];
}) {
  const { base: initialBase, ext } = useMemo(() => splitExt(initial, lockExtension), [initial, lockExtension]);
  const [base, setBase] = useState(initialBase);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setBase(initialBase); }, [open, initialBase]);

  const finalName = (base.trim() + (ext ?? "")).trim();
  const taken = new Set(existingNames.map((n) => n.toLowerCase()).filter((n) => n !== initial.toLowerCase()));
  const isDuplicate = !!finalName && taken.has(finalName.toLowerCase());
  const isEmpty = !base.trim();
  const isUnchanged = finalName === initial;
  const blocked = isEmpty || isDuplicate;

  const submit = async () => {
    if (blocked) return;
    if (isUnchanged) { onOpenChange(false); return; }
    setBusy(true);
    try { await onSubmit(finalName); onOpenChange(false); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="relative">
            <Input
              autoFocus
              value={base}
              onChange={(e) => setBase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              onFocus={(e) => e.currentTarget.select()}
              className={ext ? "pr-20" : ""}
              aria-invalid={blocked || undefined}
            />
            {ext && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground pointer-events-none select-none"
                title="The file extension cannot be changed"
              >
                {ext}
              </span>
            )}
          </div>
          {isDuplicate && (
            <p className="text-xs text-destructive">A {ext ? "file" : "folder"} with that name already exists here.</p>
          )}
          {isEmpty && (
            <p className="text-xs text-muted-foreground">Name can't be empty.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || blocked}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitExt(name: string, lock: boolean): { base: string; ext: string } {
  if (!lock) return { base: name, ext: "" };
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}
