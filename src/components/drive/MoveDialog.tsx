import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listAllFolders, type FolderRow } from "@/lib/drive-api";
import { ChevronRight, Folder, FolderRoot } from "lucide-react";
import { cn } from "@/lib/utils";

export function MoveDialog({
  open, onOpenChange, ownerId, itemName, currentParentId, excludeFolderId, onMove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string;
  itemName: string;
  currentParentId: string | null;
  /** Disallow moving INTO this folder (when moving a folder itself, to prevent self/descendant) */
  excludeFolderId?: string;
  onMove: (folderId: string | null) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: all = [] } = useQuery({
    queryKey: ["drive", "all-folders", ownerId],
    queryFn: () => listAllFolders(ownerId),
    enabled: open,
  });

  // Build set of descendants of excludeFolderId
  const blocked = useMemo(() => {
    const set = new Set<string>();
    if (!excludeFolderId) return set;
    set.add(excludeFolderId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of all) if (f.parent_id && set.has(f.parent_id) && !set.has(f.id)) {
        set.add(f.id); changed = true;
      }
    }
    return set;
  }, [all, excludeFolderId]);

  const childrenOf = (id: string | null) =>
    all.filter((f) => (f.parent_id ?? null) === id && !blocked.has(f.id));

  const submit = async () => {
    setBusy(true);
    try { await onMove(selected); onOpenChange(false); setSelected(null); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Move "{itemName}"</DialogTitle></DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto thin-scroll -mx-1">
          <Row
            label="My Drive"
            icon={<FolderRoot className="size-4" />}
            active={selected === null}
            disabled={currentParentId === null}
            onClick={() => setSelected(null)}
          />
          <Tree parentId={null} depth={1} childrenOf={childrenOf} selected={selected} setSelected={setSelected} currentParentId={currentParentId} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || selected === currentParentId}>Move here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Tree({
  parentId, depth, childrenOf, selected, setSelected, currentParentId,
}: {
  parentId: string | null;
  depth: number;
  childrenOf: (id: string | null) => FolderRow[];
  selected: string | null;
  setSelected: (v: string | null) => void;
  currentParentId: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const items = childrenOf(parentId);
  if (!items.length) return null;
  return (
    <div>
      {items.map((f) => {
        const kids = childrenOf(f.id);
        const isOpen = expanded.has(f.id);
        return (
          <div key={f.id}>
            <Row
              label={f.name}
              icon={<Folder className="size-4" />}
              active={selected === f.id}
              disabled={currentParentId === f.id}
              indent={depth}
              expandable={kids.length > 0}
              expanded={isOpen}
              onToggle={() => {
                const n = new Set(expanded);
                isOpen ? n.delete(f.id) : n.add(f.id);
                setExpanded(n);
              }}
              onClick={() => setSelected(f.id)}
            />
            {isOpen && (
              <Tree parentId={f.id} depth={depth + 1} childrenOf={childrenOf}
                    selected={selected} setSelected={setSelected} currentParentId={currentParentId} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  label, icon, active, disabled, indent = 0, expandable, expanded, onToggle, onClick,
}: {
  label: string; icon: React.ReactNode; active: boolean; disabled?: boolean;
  indent?: number; expandable?: boolean; expanded?: boolean;
  onToggle?: () => void; onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer",
        active ? "bg-primary text-primary-foreground" : "hover:bg-surface-2",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{ paddingLeft: 8 + indent * 14 }}
      onClick={() => !disabled && onClick()}
    >
      {expandable ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          className="shrink-0 p-0.5 rounded hover:bg-black/10"
        >
          <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : <span className="w-4" />}
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}
