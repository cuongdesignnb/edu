BEGIN;

-- Aggregate sorting needs the two existing counts, not administrator/onboarding/
-- parent-event projections for every school. Selected page display remains full.
CREATE FUNCTION platform.school_sort_counts(selected_school uuid)
 RETURNS TABLE(class_count integer,staff_count integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,platform,app AS $$
DECLARE previous_school text := current_setting('app.school_id',true);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid AND g.revoked_at IS NULL
   AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
   AND g.action_code IN ('platform.read','platform.schools.read','platform.schools.manage','platform.admins.manage')) THEN
  RAISE EXCEPTION 'School sort counts denied' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.school_id',selected_school::text,true);
 RETURN QUERY SELECT
  (SELECT count(*)::int FROM app.classes c WHERE c.school_id=selected_school AND c.status<>'DRAFT' AND EXISTS(SELECT 1 FROM app.academic_years y JOIN platform.schools s ON s.id=y.school_id WHERE y.school_id=c.school_id AND y.id=c.year_id AND y.status='ACTIVE' AND y.starts_on<=(now() AT TIME ZONE s.timezone)::date AND y.ends_on>(now() AT TIME ZONE s.timezone)::date)),
  (SELECT count(*)::int FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE' WHERE m.school_id=selected_school AND m.status='ACTIVE' AND m.ended_at IS NULL);
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION platform.school_sort_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.school_sort_counts(uuid) TO edu_app;

COMMIT;
