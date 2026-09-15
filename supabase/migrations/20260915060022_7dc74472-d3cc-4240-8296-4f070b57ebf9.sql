CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  birth_date date,
  gender text CHECK (gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
  share_health_by_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can create own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE TO authenticated USING (id = auth.uid());
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.health_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_groups TO authenticated;
GRANT ALL ON public.health_groups TO service_role;
ALTER TABLE public.health_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.health_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  can_view_health boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.health_groups
    WHERE id = _group_id AND owner_id = _user_id
  );
$$;

CREATE POLICY "Members can view their groups" ON public.health_groups FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_group_member(id, auth.uid()));
CREATE POLICY "Users can create groups" ON public.health_groups FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update groups" ON public.health_groups FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can delete groups" ON public.health_groups FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER update_health_groups_updated_at BEFORE UPDATE ON public.health_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can view memberships" ON public.group_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Owners can add memberships" ON public.group_members FOR INSERT TO authenticated WITH CHECK (public.is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can update memberships" ON public.group_members FOR UPDATE TO authenticated USING (public.is_group_owner(group_id, auth.uid())) WITH CHECK (public.is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners or self can remove memberships" ON public.group_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_group_owner(group_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.add_group_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;
CREATE TRIGGER add_group_owner_after_insert AFTER INSERT ON public.health_groups FOR EACH ROW EXECUTE FUNCTION public.add_group_owner_membership();

CREATE TABLE public.group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.health_groups(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL,
  email text NOT NULL,
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_invites TO authenticated;
GRANT ALL ON public.group_invites TO service_role;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view invites" ON public.group_invites FOR SELECT TO authenticated USING (public.is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can create invites" ON public.group_invites FOR INSERT TO authenticated WITH CHECK (invited_by = auth.uid() AND public.is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can update invites" ON public.group_invites FOR UPDATE TO authenticated USING (public.is_group_owner(group_id, auth.uid())) WITH CHECK (public.is_group_owner(group_id, auth.uid()));
CREATE POLICY "Owners can delete invites" ON public.group_invites FOR DELETE TO authenticated USING (public.is_group_owner(group_id, auth.uid()));
CREATE TRIGGER update_group_invites_updated_at BEFORE UPDATE ON public.group_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('sleep', 'steps', 'heart_rate')),
  value numeric NOT NULL CHECK (value >= 0),
  unit text NOT NULL,
  recorded_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'health_connect',
  shared_with_groups boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_records TO authenticated;
GRANT ALL ON public.health_records TO service_role;
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users and permitted group members can view records" ON public.health_records FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR (
    shared_with_groups AND EXISTS (
      SELECT 1
      FROM public.group_members viewer
      JOIN public.group_members owner_member ON owner_member.group_id = viewer.group_id
      WHERE viewer.user_id = auth.uid()
        AND viewer.can_view_health = true
        AND owner_member.user_id = health_records.user_id
    )
  )
);
CREATE POLICY "Users can create own records" ON public.health_records FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own records" ON public.health_records FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own records" ON public.health_records FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER update_health_records_updated_at BEFORE UPDATE ON public.health_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX health_records_user_recorded_idx ON public.health_records (user_id, recorded_at DESC);
CREATE INDEX group_members_user_idx ON public.group_members (user_id);
CREATE INDEX group_invites_group_idx ON public.group_invites (group_id);