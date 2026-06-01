
-- 1. Tighten profiles SELECT: own profile + people involved in shares + comment authors on accessible files.
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

CREATE POLICY "profiles_select_related"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.shares s
    WHERE (s.owner_id = auth.uid() AND s.shared_with = profiles.id)
       OR (s.shared_with = auth.uid() AND s.owner_id = profiles.id)
  )
  OR EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.author_id = profiles.id
      AND public.has_file_access(c.file_id, auth.uid())
  )
);

-- Security-definer RPC for email search (used in Share dialog to invite new collaborators).
CREATE OR REPLACE FUNCTION public.search_users_by_email(_query text)
RETURNS TABLE (id uuid, email text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND _query IS NOT NULL
    AND length(_query) >= 2
    AND p.email ILIKE '%' || _query || '%'
    AND p.id <> auth.uid()
  ORDER BY p.email
  LIMIT 8;
$$;

REVOKE ALL ON FUNCTION public.search_users_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.search_users_by_email(text) TO authenticated;

-- 2. Prevent privilege escalation via shares insert: must own the referenced target.
DROP POLICY IF EXISTS "shares_insert_own" ON public.shares;

CREATE POLICY "shares_insert_owns_target"
ON public.shares
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND (
    (target_type = 'file'   AND EXISTS (SELECT 1 FROM public.files   f WHERE f.id = shares.target_id AND f.owner_id = auth.uid() AND f.deleted_at IS NULL))
    OR
    (target_type = 'folder' AND EXISTS (SELECT 1 FROM public.folders d WHERE d.id = shares.target_id AND d.owner_id = auth.uid() AND d.deleted_at IS NULL))
  )
);

-- 3. Exclude soft-deleted files from has_file_access and storage shared-read policy.
CREATE OR REPLACE FUNCTION public.has_file_access(_file uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.files
    WHERE id = _file AND owner_id = _user AND deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.files f
    JOIN public.shares s
      ON s.target_type = 'file' AND s.target_id = f.id
    WHERE f.id = _file AND f.deleted_at IS NULL AND s.shared_with = _user
  )
  OR EXISTS (
    SELECT 1
    FROM public.files f
    JOIN public.shares s
      ON s.target_type = 'folder' AND s.target_id = f.folder_id
    WHERE f.id = _file AND f.deleted_at IS NULL AND s.shared_with = _user
  );
$$;

-- Recreate storage shared-read policy to additionally require non-deleted file row.
DROP POLICY IF EXISTS "drive_shared_read" ON storage.objects;

CREATE POLICY "drive_shared_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'drive'
  AND EXISTS (
    SELECT 1 FROM public.files f
    WHERE f.storage_path = objects.name
      AND f.deleted_at IS NULL
      AND public.has_file_access(f.id, auth.uid())
  )
);
