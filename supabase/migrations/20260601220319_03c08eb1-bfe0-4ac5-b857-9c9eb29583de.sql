CREATE TABLE public.public_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  allow_download BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_links TO authenticated;
GRANT ALL ON public.public_links TO service_role;

ALTER TABLE public.public_links ENABLE ROW LEVEL SECURITY;

-- Only the owner of the underlying file can create/manage links
CREATE POLICY "public_links_select_own" ON public.public_links
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "public_links_insert_own" ON public.public_links
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.files f WHERE f.id = file_id AND f.owner_id = auth.uid()
  ));

CREATE POLICY "public_links_delete_own" ON public.public_links
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX idx_public_links_file ON public.public_links(file_id);
CREATE INDEX idx_public_links_token ON public.public_links(token);