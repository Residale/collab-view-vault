
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- auto create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- folders
CREATE TABLE public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX folders_owner_parent_idx ON public.folders(owner_id, parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- files
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size BIGINT NOT NULL DEFAULT 0,
  starred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX files_owner_folder_idx ON public.files(owner_id, folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- shares
CREATE TYPE public.share_permission AS ENUM ('view', 'edit');
CREATE TYPE public.share_target AS ENUM ('file', 'folder');

CREATE TABLE public.shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type public.share_target NOT NULL,
  target_id UUID NOT NULL,
  permission public.share_permission NOT NULL DEFAULT 'view',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shared_with, target_type, target_id)
);
CREATE INDEX shares_shared_with_idx ON public.shares(shared_with);
CREATE INDEX shares_owner_idx ON public.shares(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shares TO authenticated;
GRANT ALL ON public.shares TO service_role;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- security definer helpers
CREATE OR REPLACE FUNCTION public.has_folder_access(_folder UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.folders WHERE id = _folder AND owner_id = _user)
      OR EXISTS (SELECT 1 FROM public.shares WHERE target_type = 'folder' AND target_id = _folder AND shared_with = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_file_access(_file UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.files WHERE id = _file AND owner_id = _user)
      OR EXISTS (SELECT 1 FROM public.shares WHERE target_type = 'file' AND target_id = _file AND shared_with = _user)
      OR EXISTS (
        SELECT 1 FROM public.files f
        JOIN public.shares s ON s.target_type = 'folder' AND s.target_id = f.folder_id
        WHERE f.id = _file AND s.shared_with = _user
      );
$$;

-- RLS policies
CREATE POLICY "folders_select_own_or_shared" ON public.folders FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.shares WHERE target_type = 'folder' AND target_id = folders.id AND shared_with = auth.uid()
  ));
CREATE POLICY "folders_insert_own" ON public.folders FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "folders_update_own" ON public.folders FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "folders_delete_own" ON public.folders FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "files_select_own_or_shared" ON public.files FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.shares WHERE target_type = 'file' AND target_id = files.id AND shared_with = auth.uid())
    OR (folder_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.shares WHERE target_type = 'folder' AND target_id = files.folder_id AND shared_with = auth.uid()
    ))
  );
CREATE POLICY "files_insert_own" ON public.files FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "files_update_own" ON public.files FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "files_delete_own" ON public.files FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "shares_select_involved" ON public.shares FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR shared_with = auth.uid());
CREATE POLICY "shares_insert_own" ON public.shares FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "shares_delete_own" ON public.shares FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('drive', 'drive', false)
ON CONFLICT (id) DO NOTHING;

-- storage policies: path layout is {owner_id}/{file_id}
CREATE POLICY "drive_owner_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'drive' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'drive' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "drive_shared_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'drive' AND EXISTS (
      SELECT 1 FROM public.files f
      WHERE f.storage_path = storage.objects.name
        AND public.has_file_access(f.id, auth.uid())
    )
  );
