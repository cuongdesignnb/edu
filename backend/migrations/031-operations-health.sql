BEGIN;

-- Process evidence contains no job payload, address, token or pupil data. Only
-- the worker role can attest a completed healthy cycle; API reads cannot do so.
CREATE TABLE platform.runtime_heartbeats (
 worker_id uuid PRIMARY KEY,
 started_at timestamptz NOT NULL,
 last_healthy_at timestamptz NOT NULL,
 processed_jobs integer NOT NULL CHECK(processed_jobs>=0)
);
REVOKE ALL ON platform.runtime_heartbeats FROM PUBLIC,edu_app,edu_parent;
GRANT SELECT ON platform.runtime_heartbeats TO edu_app;
GRANT SELECT,INSERT,UPDATE ON platform.runtime_heartbeats TO edu_worker;

-- PL10 needs exact operational counts under platform.operations, without
-- borrowing school directories, invitation contents or school administrator IDs.
CREATE FUNCTION platform.operations_school_totals()
 RETURNS TABLE(active_without_admin integer,pending_admin_invitations integer,expiring_admin_invitations integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform,app,identity AS $$
DECLARE previous_school text:=current_setting('app.school_id',true);
 current_school record;pending_count integer;expiring_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid AND g.action_code='platform.operations'
   AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())) THEN
  RAISE EXCEPTION 'Operations aggregate denied' USING ERRCODE='42501';
 END IF;
 active_without_admin:=0;pending_admin_invitations:=0;expiring_admin_invitations:=0;
 FOR current_school IN SELECT id,status FROM platform.schools ORDER BY id LOOP
  PERFORM set_config('app.school_id',current_school.id::text,true);
  IF current_school.status='ACTIVE' AND NOT EXISTS(
   SELECT 1 FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
   JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL'
   JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND r.system_role AND r.status='ACTIVE'
   WHERE m.school_id=current_school.id AND m.status='ACTIVE' AND m.ended_at IS NULL
    AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
  ) THEN active_without_admin:=active_without_admin+1; END IF;
  SELECT count(*)::int,count(*) FILTER(WHERE i.expires_at<=now()+interval '3 days')::int
  INTO pending_count,expiring_count FROM app.staff_invitations i
  WHERE i.school_id=current_school.id AND i.status='PENDING' AND i.expires_at>now()
   AND jsonb_array_length(i.proposed_assignments)=1 AND EXISTS(
    SELECT 1 FROM app.roles r WHERE r.school_id=i.school_id AND r.id::text=i.proposed_assignments->0->>'roleId'
     AND r.code='SCHOOL_ADMIN' AND r.system_role AND i.proposed_assignments->0->>'scopeType'='SCHOOL');
  pending_admin_invitations:=pending_admin_invitations+pending_count;
  expiring_admin_invitations:=expiring_admin_invitations+expiring_count;
 END LOOP;
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
 RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION platform.operations_school_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.operations_school_totals() TO edu_app;
COMMIT;
