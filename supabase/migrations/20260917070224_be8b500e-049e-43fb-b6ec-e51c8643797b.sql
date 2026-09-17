REVOKE ALL ON FUNCTION public.accept_group_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_group_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_group_invite(uuid) TO authenticated;