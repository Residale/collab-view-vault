import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { detectExternalLink } from "@/lib/drive-api";

export function AddLinkDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onSubmit: (url: string, name?: string) => Promise<void> | void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setUrl(""); setName(""); setBusy(false); }
  }, [open]);

  const detected = url ? detectExternalLink(url.trim()) : null;
  const valid = !!detected;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try { await onSubmit(url.trim(), name.trim() || undefined); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>
            Paste a Google Sheets, Docs, Slides or any web URL. It opens in a new tab when clicked.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
          />
          <Input
            placeholder={detected ? `Name (default: ${detected.defaultName})` : "Display name (optional)"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
          />
          {url && !valid && (
            <p className="text-xs text-destructive">That doesn't look like a valid URL.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={submit}>Add link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
