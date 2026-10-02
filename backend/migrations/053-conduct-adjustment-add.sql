BEGIN;
-- Approved additions retain every existing immutable fact, scope and scoring guard.
CREATE OR REPLACE FUNCTION app.adjustment_mutation_allowed(sid uuid,pid uuid,rid uuid,action_name text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.adjustment_requests a JOIN app.publication_revisions p ON p.school_id=a.school_id AND p.id=a.baseline_publication_id
  JOIN platform.schools school ON school.id=a.school_id AND school.status='ACTIVE'
  WHERE a.school_id=sid AND a.period_id=pid AND a.status='APPROVED' AND p.status='PUBLISHED'
  AND p.source_version=a.baseline_source_version AND a.id=NULLIF(current_setting('app.adjustment_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.proposed_changes) change WHERE change->>'action'=action_name AND (change->>'recordId'=rid::text OR (action_name='ADD' AND change->'replacement'->>'clientEventId'=rid::text)))
  AND (SELECT count(DISTINCT rp.action_code) FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
   JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
   JOIN app.role_permissions rp ON rp.school_id=r.school_id AND rp.role_id=r.id AND g.scope_type=ANY(rp.allowed_scopes)
   WHERE m.school_id=sid AND m.user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid AND m.status='ACTIVE' AND m.ended_at IS NULL
   AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
   AND (g.scope_type='SCHOOL' OR (g.scope_type='CLASS' AND g.class_id=p.class_id AND (r.code<>'HOMEROOM' OR EXISTS(
    SELECT 1 FROM app.teaching_assignments ta JOIN platform.schools sc ON sc.id=ta.school_id WHERE ta.school_id=g.school_id AND ta.role_grant_id=g.id
    AND ta.revoked_at IS NULL AND ta.starts_on<=(now() AT TIME ZONE sc.timezone)::date AND (ta.ends_on IS NULL OR ta.ends_on>(now() AT TIME ZONE sc.timezone)::date)))))
   AND rp.action_code IN ('conduct.adjust.approve','conduct.publish'))=2)
$$;
REVOKE ALL ON FUNCTION app.adjustment_mutation_allowed(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adjustment_mutation_allowed(uuid,uuid,uuid,text) TO edu_app,edu_worker;
CREATE FUNCTION app.adjustment_add_allowed(rec app.conduct_records) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT rec.source_kind='MANUAL' AND rec.source_key ~ '^manual:[a-f0-9-]{36}$'
  AND rec.internal_note IS NULL AND rec.source_id IS NULL AND rec.subject_id IS NULL AND rec.lesson_id IS NULL
  AND EXISTS(SELECT 1 FROM app.adjustment_requests a
   CROSS JOIN LATERAL jsonb_array_elements(a.proposed_changes) change
   WHERE a.school_id=rec.school_id AND a.period_id=rec.period_id AND a.status='APPROVED'
   AND a.id=NULLIF(current_setting('app.adjustment_id',true),'')::uuid
   AND change->>'action'='ADD'
   AND change->'replacement'->>'clientEventId'=substring(rec.source_key from 8)
   AND change->'replacement'->>'periodId'=rec.period_id::text
   AND change->'replacement'->>'enrollmentId'=rec.enrollment_id::text
   AND change->'replacement'->>'ruleId'=rec.rule_id::text
   AND (change->'replacement'->>'occurredAt')::timestamptz=rec.occurred_at
   AND change->'replacement'->>'publicReason'=rec.public_reason
   AND rec.recorded_by=a.requested_by
   AND rec.approved_by=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
   AND app.adjustment_mutation_allowed(rec.school_id,rec.period_id,(change->'replacement'->>'clientEventId')::uuid,'ADD'))
$$;
REVOKE ALL ON FUNCTION app.adjustment_add_allowed(app.conduct_records) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adjustment_add_allowed(app.conduct_records) TO edu_app,edu_worker;
CREATE OR REPLACE FUNCTION app.guard_conduct_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p app.conduct_periods; e app.enrollments; r app.conduct_rules; w app.school_weeks; day date; n integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conduct facts retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM app.conduct_periods WHERE school_id=NEW.school_id AND id=NEW.period_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.school_id,NEW.class_id,NEW.period_id,NEW.rule_set_id,NEW.rule_id,NEW.enrollment_id,NEW.occurred_at,NEW.source_kind,NEW.source_key,NEW.source_id,NEW.subject_id,NEW.lesson_id,NEW.recorded_by,NEW.supersedes_id)
  IS DISTINCT FROM (OLD.school_id,OLD.class_id,OLD.period_id,OLD.rule_set_id,OLD.rule_id,OLD.enrollment_id,OLD.occurred_at,OLD.source_kind,OLD.source_key,OLD.source_id,OLD.subject_id,OLD.lesson_id,OLD.recorded_by,OLD.supersedes_id)
  THEN RAISE EXCEPTION 'Conduct identity immutable' USING ERRCODE='23514'; END IF;
 IF p.status='LOCKED' AND NOT (TG_OP='UPDATE' AND NEW.status='EXCLUDED' AND
  (app.adjustment_mutation_allowed(NEW.school_id,p.id,NEW.id,'EXCLUDE') OR app.adjustment_mutation_allowed(NEW.school_id,p.id,NEW.id,'REPLACE')))
  AND NOT (TG_OP='INSERT' AND NEW.status='APPROVED' AND NEW.supersedes_id IS NOT NULL AND app.adjustment_mutation_allowed(NEW.school_id,p.id,NEW.supersedes_id,'REPLACE'))
  AND NOT (TG_OP='INSERT' AND NEW.status='APPROVED' AND NEW.supersedes_id IS NULL AND app.adjustment_add_allowed(NEW))
  THEN RAISE EXCEPTION 'Conduct period locked' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' THEN
  IF OLD.status='EXCLUDED' OR NEW.status<>'EXCLUDED' OR NEW.exclusion_reason IS NULL OR length(btrim(NEW.exclusion_reason))<5
   OR (to_jsonb(NEW)-ARRAY['status','exclusion_reason','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','exclusion_reason','version','updated_at'])
   THEN RAISE EXCEPTION 'Approved fact immutable; replace through adjustment' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO e FROM app.enrollments WHERE school_id=NEW.school_id AND id=NEW.enrollment_id;
 SELECT * INTO r FROM app.conduct_rules WHERE school_id=NEW.school_id AND id=NEW.rule_id;
 SELECT * INTO w FROM app.school_weeks WHERE school_id=NEW.school_id AND id=p.week_id;
 SELECT (NEW.occurred_at AT TIME ZONE timezone)::date INTO day FROM platform.schools WHERE id=NEW.school_id;
 IF p.id IS NULL OR e.id IS NULL OR r.id IS NULL OR e.class_id<>NEW.class_id OR p.class_id<>NEW.class_id OR e.year_id<>p.year_id
  OR p.rule_set_id<>NEW.rule_set_id OR r.rule_set_id<>p.rule_set_id OR e.status='CANCELLED' OR day<e.starts_on OR (e.ends_on IS NOT NULL AND day>=e.ends_on)
  OR day<w.starts_on OR day>=w.ends_on OR r.label<>NEW.rule_label_snapshot OR (r.value_mode='FIXED' AND r.default_delta<>NEW.delta_snapshot)
  OR (r.value_mode='MANUAL' AND (r.minimum_delta IS NULL OR r.maximum_delta IS NULL OR NEW.delta_snapshot<r.minimum_delta OR NEW.delta_snapshot>r.maximum_delta))
  THEN RAISE EXCEPTION 'Invalid conduct source/rule/enrollment' USING ERRCODE='23514'; END IF;
 IF NEW.status='EXCLUDED' AND (NEW.exclusion_reason IS NULL OR length(btrim(NEW.exclusion_reason))<5) THEN RAISE EXCEPTION 'Exclusion reason required' USING ERRCODE='23514'; END IF;
 IF NEW.status='APPROVED' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN RAISE EXCEPTION 'Approval attribution required' USING ERRCODE='23514'; END IF;
 IF NEW.status<>'EXCLUDED' AND r.max_occurrences_per_day IS NOT NULL THEN
  SELECT count(*) INTO n FROM app.conduct_records c JOIN platform.schools s ON s.id=c.school_id WHERE c.school_id=NEW.school_id
   AND c.enrollment_id=NEW.enrollment_id AND c.rule_id=NEW.rule_id AND c.id<>NEW.id AND c.status<>'EXCLUDED' AND (c.occurred_at AT TIME ZONE s.timezone)::date=day;
  IF n>=r.max_occurrences_per_day THEN RAISE EXCEPTION 'Daily rule occurrence limit' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
