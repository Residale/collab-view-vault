
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS content_text text,
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS files_search_tsv_idx ON public.files USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS files_name_trgm_idx ON public.files USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS folders_name_trgm_idx ON public.folders USING GIN (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  query text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_history TO authenticated;
GRANT ALL ON public.search_history TO service_role;

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_history_select_own" ON public.search_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "search_history_insert_own" ON public.search_history
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "search_history_delete_own" ON public.search_history
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS search_history_user_idx
  ON public.search_history (user_id, created_at DESC);
