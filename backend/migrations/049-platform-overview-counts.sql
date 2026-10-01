BEGIN;

-- The overview needs two aggregate facts, not per-school onboarding, admin
-- names, class setup and invitations. Retain FORCE RLS and the five-second
-- runtime timeout; inspect each tenant only after independent operator consent.
CREATE FUNCTION platform.overview_counts()
 RETURNS TABLE(total integer,active integer,draft integer,suspended integer,staff integer,opens bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,platform,app AS $$
DECLARE previous_school text := current_setting('app.school_id',true);
 selected_school record;
 tenant_staff integer;
 tenant_opens bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
   AND g.action_code='platform.read' AND g.revoked_at IS NULL AND g.valid_from<=now()
   AND (g.valid_until IS NULL OR g.valid_until>now())) THEN
  RAISE EXCEPTION 'Platform overview aggregate denied' USING ERRCODE='42501';
 END IF;
 SELECT count(*)::int,count(*) FILTER(WHERE s.status='ACTIVE')::int,
  count(*) FILTER(WHERE s.status='DRAFT')::int,count(*) FILTER(WHERE s.status='SUSPENDED')::int
  INTO total,active,draft,suspended FROM platform.schools s;
 staff:=0;opens:=0;
 FOR selected_school IN SELECT s.id,s.status FROM platform.schools s ORDER BY s.id LOOP
  PERFORM set_config('app.school_id',selected_school.id::text,true);
  IF selected_school.status='ACTIVE' THEN
   SELECT count(*)::int INTO tenant_staff FROM app.memberships m
    JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
    WHERE m.school_id=selected_school.id AND m.status='ACTIVE' AND m.ended_at IS NULL;
   staff:=staff+tenant_staff;
  END IF;
  SELECT count(*) INTO tenant_opens FROM app.parent_access_events e
   WHERE e.school_id=selected_school.id AND e.created_at>=now()-interval '30 days'
    AND e.event_kind IN ('EXCHANGED','READ');
  opens:=opens+tenant_opens;
 END LOOP;
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
 RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION platform.overview_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.overview_counts() TO edu_app;

COMMIT;
