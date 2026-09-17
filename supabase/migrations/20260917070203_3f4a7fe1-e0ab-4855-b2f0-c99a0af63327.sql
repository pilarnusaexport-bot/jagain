-- Invitee can see invites addressed to their email
CREATE POLICY "Invitees can view their invites" ON public.group_invites
  FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

-- Invitee can see the group name of a group they are invited to
CREATE POLICY "Invitees can view invited groups" ON public.health_groups
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_invites gi
    WHERE gi.group_id = health_groups.id
      AND gi.status = 'pending'
      AND gi.expires_at > now()
      AND lower(gi.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  ));

CREATE OR REPLACE FUNCTION public.accept_group_invite(_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.group_invites;
  v_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.group_invites
  WHERE id = _invite_id
    AND status = 'pending'
    AND expires_at > now()
    AND lower(email) = v_email;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'invite not found or expired';
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;

  UPDATE public.group_invites SET status = 'accepted', updated_at = now() WHERE id = v_invite.id;

  RETURN v_invite.group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_group_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
BEGIN
  UPDATE public.group_invites
  SET status = 'revoked', updated_at = now()
  WHERE id = _invite_id AND status = 'pending' AND lower(email) = v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_group_invite(uuid) TO authenticated;