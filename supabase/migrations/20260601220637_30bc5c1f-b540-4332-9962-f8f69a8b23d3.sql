-- TAGS
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_select_own" ON public.tags FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tags_insert_own" ON public.tags FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "tags_update_own" ON public.tags FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tags_delete_own" ON public.tags FOR DELETE TO authenticated USING (user_id = auth.uid());

-- FILE TAGS
CREATE TABLE public.file_tags (
  file_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, tag_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.file_tags TO authenticated;
GRANT ALL ON public.file_tags TO service_role;
ALTER TABLE public.file_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "file_tags_select_own" ON public.file_tags FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "file_tags_insert_own" ON public.file_tags FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_id AND f.owner_id = auth.uid()));
CREATE POLICY "file_tags_delete_own" ON public.file_tags FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_file_tags_file ON public.file_tags(file_id);
CREATE INDEX idx_file_tags_tag ON public.file_tags(tag_id);

-- COMMENTS
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select_if_file_access" ON public.comments FOR SELECT TO authenticated
  USING (public.has_file_access(file_id, auth.uid()));
CREATE POLICY "comments_insert_if_file_access" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.has_file_access(file_id, auth.uid()));
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE TO authenticated USING (author_id = auth.uid());
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE TO authenticated USING (author_id = auth.uid());
CREATE INDEX idx_comments_file ON public.comments(file_id, created_at DESC);