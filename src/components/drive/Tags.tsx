import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Tag as TagIcon, Check } from "lucide-react";
import { toast } from "sonner";
import {
  TAG_COLORS, attachTag, createTag, detachTag, listFileTagIds, listTags, type Tag,
} from "@/lib/tags";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TagBadge({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1"
      style={{
        backgroundColor: tag.color + "22",
        color: tag.color,
        borderColor: tag.color + "55",
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 opacity-60 hover:opacity-100">
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export function FileTagsEditor({ fileId, userId }: { fileId: string; userId: string }) {
  const qc = useQueryClient();
  const { data: allTags = [] } = useQuery({
    queryKey: ["tags", userId],
    queryFn: () => listTags(userId),
  });
  const { data: attachedIds = [] } = useQuery({
    queryKey: ["file-tag-ids", fileId],
    queryFn: () => listFileTagIds(fileId),
  });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[5]);

  const attached = allTags.filter((t) => attachedIds.includes(t.id));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["file-tag-ids", fileId] });
    qc.invalidateQueries({ queryKey: ["tags", userId] });
  };

  async function toggle(t: Tag) {
    try {
      if (attachedIds.includes(t.id)) {
        await detachTag(fileId, t.id, userId);
      } else {
        await attachTag(fileId, t.id, userId);
      }
      invalidate();
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const t = await createTag(userId, name, newColor);
      await attachTag(fileId, t.id, userId);
      setNewName("");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div>
      <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">Tags</h3>
      <div className="flex flex-wrap gap-1.5 items-center">
        {attached.map((t) => (
          <TagBadge key={t.id} tag={t} onRemove={() => toggle(t)} />
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-hairline text-muted-foreground hover:text-foreground hover:bg-surface">
              <Plus className="size-2.5" /> Tag
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
              Your tags
            </div>
            <div className="max-h-44 overflow-y-auto thin-scroll space-y-0.5 mb-2">
              {allTags.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-1">No tags yet.</div>
              )}
              {allTags.map((t) => {
                const on = attachedIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="flex-1 truncate">{t.name}</span>
                    {on && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-hairline pt-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
                New tag
              </div>
              <div className="flex gap-1.5 items-center">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  placeholder="Name"
                  className="h-7 text-xs"
                />
                <button onClick={handleCreate} className="size-7 grid place-items-center rounded bg-primary text-primary-foreground hover:opacity-90">
                  <Plus className="size-3.5" />
                </button>
              </div>
              <div className="flex gap-1 mt-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="size-5 rounded-full ring-2 ring-offset-1 ring-offset-background"
                    style={{
                      backgroundColor: c,
                      // @ts-ignore
                      "--tw-ring-color": newColor === c ? c : "transparent",
                    }}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function FileTagChips({ fileId, userId }: { fileId: string; userId: string }) {
  const { data: tags = [] } = useQuery({
    queryKey: ["tags", userId],
    queryFn: () => listTags(userId),
  });
  const { data: ids = [] } = useQuery({
    queryKey: ["file-tag-ids", fileId],
    queryFn: () => listFileTagIds(fileId),
  });
  const attached = tags.filter((t) => ids.includes(t.id));
  if (attached.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {attached.map((t) => <TagBadge key={t.id} tag={t} />)}
    </div>
  );
}
