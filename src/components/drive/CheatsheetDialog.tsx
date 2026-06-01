import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Navigation",
    items: [
      ["⌘ K  /  Ctrl K", "Open command palette"],
      ["/", "Quick search"],
      ["?", "Show this cheatsheet"],
      ["Esc", "Close preview / clear selection"],
    ],
  },
  {
    title: "Files",
    items: [
      ["Space", "Quick Look"],
      ["Enter", "Download / open"],
      ["R", "Rename selected"],
      ["S", "Star / unstar"],
      ["Del / ⌫", "Move to Trash"],
    ],
  },
  {
    title: "Create & upload",
    items: [
      ["N", "New folder"],
      ["U", "Upload files"],
    ],
  },
  {
    title: "Selection",
    items: [
      ["⌘ A  /  Ctrl A", "Select all"],
      ["Shift + click", "Range select"],
      ["⌘ / Ctrl + click", "Toggle selection"],
    ],
  },
];

export function CheatsheetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Move faster across your drive.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {g.title}
              </div>
              <ul className="space-y-1.5">
                {g.items.map(([keys, label]) => (
                  <li key={keys} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-surface-2 border border-hairline font-mono text-xs text-muted-foreground">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
