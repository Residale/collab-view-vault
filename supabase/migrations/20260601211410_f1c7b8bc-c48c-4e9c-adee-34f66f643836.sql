-- Soft-delete columns for trash system
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON public.files(owner_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON public.folders(owner_id, deleted_at);

-- Update SELECT policies to exclude trashed items by default.
-- Trash view will query with an explicit deleted_at IS NOT NULL filter.
DROP POLICY IF EXISTS files_select_own_or_shared ON public.files;
CREATE POLICY files_select_own_or_shared ON public.files
  FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (EXISTS (SELECT 1 FROM public.shares WHERE shares.target_type = 'file' AND shares.target_id = files.id AND shares.shared_with = auth.uid()))
    OR (folder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.shares WHERE shares.target_type = 'folder' AND shares.target_id = files.folder_id AND shares.shared_with = auth.uid()))
  );

DROP POLICY IF EXISTS folders_select_own_or_shared ON public.folders;
CREATE POLICY folders_select_own_or_shared ON public.folders
  FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (EXISTS (SELECT 1 FROM public.shares WHERE shares.target_type = 'folder' AND shares.target_id = folders.id AND shares.shared_with = auth.uid()))
  );