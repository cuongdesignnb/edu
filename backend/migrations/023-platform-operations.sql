BEGIN;
ALTER TABLE platform.schools
 ADD COLUMN short_name text CHECK(length(short_name)<=200),
 ADD COLUMN province text CHECK(length(province)<=120),
 ADD COLUMN level text CHECK(level IN ('THPT','THCS','Tiểu học')),
 ADD COLUMN accent_color text NOT NULL DEFAULT '#0a72e6' CHECK(accent_color ~ '^#[0-9a-fA-F]{6}$'),
 ADD COLUMN motto text NOT NULL DEFAULT '' CHECK(length(motto)<=300),
 ADD COLUMN public_intro text NOT NULL DEFAULT '' CHECK(length(public_intro)<=4000),
 ADD COLUMN status_reason text CHECK(length(status_reason)<=2000),
 ADD COLUMN activated_at timestamptz;

CREATE TABLE platform.idempotency_keys(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid NOT NULL REFERENCES identity.users(id),
 operation_id text NOT NULL,key_hash text NOT NULL,request_hash text NOT NULL,
 response_status integer,response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 UNIQUE(actor_user_id,operation_id,key_hash)
);
GRANT SELECT,INSERT,UPDATE ON platform.idempotency_keys TO edu_app;
CREATE INDEX platform_idempotency_expiry ON platform.idempotency_keys(expires_at);
INSERT INTO platform.settings(key,value) VALUES('business_ui',jsonb_build_object('brandName','EduManage','supportEmail',NULL,'publicSupportPhone',NULL,'footerNote','')) ON CONFLICT(key) DO NOTHING;

-- Return operational counts and current school-admin work labels only. The
-- owner is still FORCE-RLS constrained; each school is selected explicitly.
CREATE FUNCTION platform.operational_counts(selected_school uuid)
 RETURNS TABLE(class_count integer,staff_count integer,admin_count integer,admin_labels text[],onboarding jsonb,link_opens_30d bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,platform,app AS $$
DECLARE previous_school text := current_setting('app.school_id',true);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform.operator_grants g JOIN identity.users u ON u.id=g.user_id AND u.status='ACTIVE'
  WHERE g.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid AND g.revoked_at IS NULL
   AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
   AND g.action_code IN ('platform.read','platform.schools.read','platform.schools.manage','platform.admins.manage')) THEN
  RAISE EXCEPTION 'Operational aggregate denied' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.school_id',selected_school::text,true);
 RETURN QUERY WITH admin AS(
  SELECT DISTINCT m.id,m.work_display_name FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
   JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
   JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.code='SCHOOL_ADMIN' AND r.status='ACTIVE'
   WHERE m.school_id=selected_school AND m.status='ACTIVE' AND m.ended_at IS NULL),
 counts AS(SELECT
  (SELECT count(*)::int FROM app.classes c WHERE c.school_id=selected_school AND c.status<>'DRAFT' AND EXISTS(SELECT 1 FROM app.academic_years y JOIN platform.schools s ON s.id=y.school_id WHERE y.school_id=c.school_id AND y.id=c.year_id AND y.status='ACTIVE' AND y.starts_on<=(now() AT TIME ZONE s.timezone)::date AND y.ends_on>(now() AT TIME ZONE s.timezone)::date)) AS cls,
  (SELECT count(*)::int FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE' WHERE m.school_id=selected_school AND m.status='ACTIVE' AND m.ended_at IS NULL) AS staff,
  (SELECT count(*)::int FROM admin) AS admins)
 SELECT counts.cls,counts.staff,counts.admins,coalesce((SELECT array_agg(work_display_name ORDER BY work_display_name,id) FROM admin),ARRAY[]::text[]),
  jsonb_build_object('profileDone',EXISTS(SELECT 1 FROM platform.schools WHERE id=selected_school AND length(name)>0),'adminAssigned',counts.admins>0,
   'yearCreated',EXISTS(SELECT 1 FROM app.academic_years WHERE school_id=selected_school),'classesCreated',EXISTS(SELECT 1 FROM app.classes WHERE school_id=selected_school),
   'teachersInvited',EXISTS(SELECT 1 FROM app.staff_invitations i WHERE i.school_id=selected_school AND i.status IN ('PENDING','ACCEPTED') AND EXISTS(SELECT 1 FROM jsonb_array_elements(i.proposed_assignments) p WHERE p->>'scopeType' IN ('CLASS','SUBJECT'))),
   'studentsImported',EXISTS(SELECT 1 FROM app.enrollments WHERE school_id=selected_school AND status<>'CANCELLED'),
   'homeroomAssigned',EXISTS(SELECT 1 FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE' JOIN platform.schools s ON s.id=a.school_id WHERE a.school_id=selected_school AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date)),
   'rulesPublished',EXISTS(SELECT 1 FROM app.conduct_rule_sets WHERE school_id=selected_school AND status='ISSUED')),
  (SELECT count(*) FROM app.parent_access_events WHERE school_id=selected_school AND created_at>=now()-interval '30 days' AND event_kind IN ('EXCHANGED','READ')) FROM counts;
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.school_id',coalesce(previous_school,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION platform.operational_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.operational_counts(uuid) TO edu_app;
COMMIT;
