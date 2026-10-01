BEGIN;

-- Text search needs only the same currently effective administrator work labels,
-- not every operational class/staff/onboarding/event aggregate for every school.
CREATE FUNCTION platform.school_admin_labels(selected_school uuid)
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path=pg_catalog,platform,app AS $$
DECLARE previous_school text := current_setting('app.school_id',true); result text[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid AND g.revoked_at IS NULL
   AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
   AND g.action_code IN ('platform.read','platform.schools.read','platform.schools.manage','platform.admins.manage')) THEN
  RAISE EXCEPTION 'School administrator search denied' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.school_id',selected_school::text,true);
 SELECT coalesce(array_agg(admin.work_display_name ORDER BY admin.work_display_name,admin.id),ARRAY[]::text[]) INTO result
 FROM (SELECT DISTINCT m.id,m.work_display_name FROM app.memberships m
  JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
  JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL'
   AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
  JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND r.status='ACTIVE'
  WHERE m.school_id=selected_school AND m.status='ACTIVE' AND m.ended_at IS NULL) admin;
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION platform.school_admin_labels(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.school_admin_labels(uuid) TO edu_app;

COMMIT;
