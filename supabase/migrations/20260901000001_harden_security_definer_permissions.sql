REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, public.app_role[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO service_role;