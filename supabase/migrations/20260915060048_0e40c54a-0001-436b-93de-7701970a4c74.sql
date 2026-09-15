CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.update_updated_at_column() SET SCHEMA private;
ALTER FUNCTION public.is_group_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_group_owner(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.add_group_owner_membership() SET SCHEMA private;

REVOKE ALL ON FUNCTION private.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.add_group_owner_membership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_group_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_group_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_group_owner(uuid, uuid) TO authenticated, service_role;