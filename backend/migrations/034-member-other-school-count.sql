BEGIN;

-- SC11 may mention only how many other schools a member belongs to. Resolve
-- the subject from a member in the caller's current school, never a user UUID.
-- FORCE RLS remains enabled; each internal count uses an explicit school scope.
CREATE FUNCTION app.member_other_school_count(member_id uuid) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,platform,identity AS $$
DECLARE previous_school text:=current_setting('app.school_id',true);
 source_school uuid:=NULLIF(previous_school,'')::uuid;
 subject_user uuid;other_school record;school_count integer;result integer:=0;
BEGIN
 IF source_school IS NULL OR coalesce(current_setting('app.parent_session_id',true),'')<>''
  OR coalesce(current_setting('app.support_access_id',true),'')<>'' OR NOT EXISTS(
   SELECT 1 FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
   JOIN platform.schools s ON s.id=m.school_id AND s.status='ACTIVE'
   JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL'
   JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
   JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id
    AND p.action_code='member.read' AND 'SCHOOL'=ANY(p.allowed_scopes)
   WHERE m.school_id=source_school AND m.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
    AND m.status='ACTIVE' AND m.ended_at IS NULL AND g.revoked_at IS NULL
    AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
  ) THEN RAISE EXCEPTION 'Member aggregate denied' USING ERRCODE='42501'; END IF;
 SELECT m.user_id INTO subject_user FROM app.memberships m WHERE m.school_id=source_school AND m.id=member_id;
 IF subject_user IS NULL THEN RAISE EXCEPTION 'Member aggregate denied' USING ERRCODE='42501'; END IF;
 FOR other_school IN SELECT s.id FROM platform.schools s WHERE s.id<>source_school ORDER BY s.id LOOP
  PERFORM set_config('app.school_id',other_school.id::text,true);
  SELECT count(*)::int INTO school_count FROM app.memberships m WHERE m.school_id=other_school.id AND m.user_id=subject_user;
  result:=result+school_count;
 END LOOP;
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION app.member_other_school_count(uuid) FROM PUBLIC,edu_parent,edu_worker;
GRANT EXECUTE ON FUNCTION app.member_other_school_count(uuid) TO edu_app;

COMMIT;
