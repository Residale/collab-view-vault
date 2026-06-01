DROP POLICY IF EXISTS drive_preview_metadata_update ON storage.objects;

CREATE POLICY drive_preview_metadata_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'drive'
  AND EXISTS (
    SELECT 1
    FROM public.files f
    WHERE f.storage_path = storage.objects.name
      AND public.has_file_access(f.id, auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'drive'
  AND EXISTS (
    SELECT 1
    FROM public.files f
    WHERE f.storage_path = storage.objects.name
      AND public.has_file_access(f.id, auth.uid())
  )
);