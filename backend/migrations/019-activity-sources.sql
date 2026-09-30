BEGIN;
ALTER TABLE app.activities ADD COLUMN data_version integer NOT NULL DEFAULT 1 CHECK(data_version>0);
ALTER TABLE app.activities ADD COLUMN assigned_at timestamptz;
ALTER TABLE app.activities ADD COLUMN illustration text NOT NULL DEFAULT 'heart' CHECK(illustration IN ('trophy','stem','clean','book','heart'));
ALTER TABLE app.activity_participants ADD COLUMN cancelled_at timestamptz;
CREATE UNIQUE INDEX evidence_file_owner ON app.evidence(school_id,file_id);
CREATE FUNCTION app.guard_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE y app.academic_years; due date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Activity history retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO y FROM app.academic_years WHERE school_id=NEW.school_id AND id=NEW.year_id;
 SELECT (NEW.due_at AT TIME ZONE timezone)::date INTO due FROM platform.schools WHERE id=NEW.school_id;
 IF y.id IS NULL OR due<y.starts_on OR due>=y.ends_on THEN RAISE EXCEPTION 'Activity due date outside year' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.school_id,NEW.class_id,NEW.year_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.school_id,OLD.class_id,OLD.year_id,OLD.created_by,OLD.created_at)
   OR (OLD.assigned_at IS NOT NULL AND NEW.assigned_at IS DISTINCT FROM OLD.assigned_at) OR (OLD.status<>'DRAFT' AND NEW.status='DRAFT')
   THEN RAISE EXCEPTION 'Activity identity immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='ARCHIVED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Activity archived' USING ERRCODE='23514'; END IF;
  IF NEW.status='ARCHIVED' AND EXISTS(SELECT 1 FROM app.activity_participants ap JOIN app.conduct_records c ON c.school_id=ap.school_id AND c.source_id=ap.id AND c.source_kind='ACTIVITY'
    JOIN app.conduct_periods p ON p.school_id=c.school_id AND p.id=c.period_id WHERE ap.school_id=NEW.school_id AND ap.activity_id=NEW.id AND c.status='APPROVED' AND p.status='LOCKED')
   THEN RAISE EXCEPTION 'Locked activity source' USING ERRCODE='23514'; END IF;
  NEW.data_version=OLD.data_version+1;
 END IF;
 IF NEW.status IN ('ASSIGNED','CLOSED') AND NEW.assigned_at IS NULL THEN RAISE EXCEPTION 'Assignment attribution required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_activity BEFORE INSERT OR UPDATE OR DELETE ON app.activities FOR EACH ROW EXECUTE FUNCTION app.guard_activity();
CREATE FUNCTION app.guard_activity_participant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a app.activities; e app.enrollments; day date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Activity participant history retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM app.activities WHERE school_id=NEW.school_id AND id=NEW.activity_id FOR UPDATE;
 SELECT * INTO e FROM app.enrollments WHERE school_id=NEW.school_id AND id=NEW.enrollment_id;
 SELECT (NEW.created_at AT TIME ZONE timezone)::date INTO day FROM platform.schools WHERE id=NEW.school_id;
 IF a.id IS NULL OR e.id IS NULL OR a.class_id<>NEW.class_id OR e.class_id<>NEW.class_id OR a.year_id<>e.year_id
  THEN RAISE EXCEPTION 'Participant class/year mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.cancelled_at IS NULL AND (e.status='CANCELLED' OR e.starts_on>day OR (e.ends_on IS NOT NULL AND e.ends_on<=day))
  THEN RAISE EXCEPTION 'Participant enrollment ineffective' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.school_id,NEW.class_id,NEW.activity_id,NEW.enrollment_id,NEW.created_at) IS DISTINCT FROM (OLD.school_id,OLD.class_id,OLD.activity_id,OLD.enrollment_id,OLD.created_at)
   THEN RAISE EXCEPTION 'Participant identity immutable' USING ERRCODE='23514'; END IF;
  IF (NEW.status<>'APPROVED' OR NEW.cancelled_at IS NOT NULL) AND EXISTS(SELECT 1 FROM app.conduct_records c JOIN app.conduct_periods p ON p.school_id=c.school_id AND p.id=c.period_id
    WHERE c.school_id=OLD.school_id AND c.source_kind='ACTIVITY' AND c.source_id=OLD.id AND c.status='APPROVED' AND p.status='LOCKED')
   THEN RAISE EXCEPTION 'Locked activity conduct source' USING ERRCODE='23514'; END IF;
  IF NEW.cancelled_at IS NOT NULL AND (OLD.status<>'ASSIGNED' OR EXISTS(SELECT 1 FROM app.evidence WHERE school_id=OLD.school_id AND participant_id=OLD.id))
   THEN RAISE EXCEPTION 'Received participant retained' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status IN ('APPROVED','NEEDS_REVISION','EXCUSED') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR length(btrim(coalesce(NEW.review_note,'')))<3)
  THEN RAISE EXCEPTION 'Participant review attribution required' USING ERRCODE='23514'; END IF;
 IF a.status IN ('CLOSED','ARCHIVED') THEN RAISE EXCEPTION 'Activity closed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_activity_participant BEFORE INSERT OR UPDATE OR DELETE ON app.activity_participants FOR EACH ROW EXECUTE FUNCTION app.guard_activity_participant();
CREATE FUNCTION app.guard_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p app.activity_participants; a app.activities; f app.files;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Evidence history retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM app.activity_participants WHERE school_id=NEW.school_id AND id=NEW.participant_id FOR UPDATE;
 SELECT * INTO a FROM app.activities WHERE school_id=p.school_id AND id=p.activity_id FOR UPDATE;
 SELECT * INTO f FROM app.files WHERE school_id=NEW.school_id AND id=NEW.file_id;
 IF p.id IS NULL OR p.cancelled_at IS NOT NULL OR a.status<>'ASSIGNED' OR f.status<>'READY' OR f.purpose<>'EVIDENCE' OR f.upload_class_id IS DISTINCT FROM p.class_id OR (f.expires_at IS NOT NULL AND f.expires_at<=now())
  THEN RAISE EXCEPTION 'Invalid evidence participant/file' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.school_id,NEW.participant_id,NEW.file_id,NEW.submitted_by,NEW.created_at) IS DISTINCT FROM (OLD.school_id,OLD.participant_id,OLD.file_id,OLD.submitted_by,OLD.created_at)
  THEN RAISE EXCEPTION 'Evidence identity immutable' USING ERRCODE='23514'; END IF;
 IF NEW.share_with_guardian AND NEW.status<>'APPROVED' THEN RAISE EXCEPTION 'Only approved evidence may be shared' USING ERRCODE='23514'; END IF;
 IF NEW.status<>'SUBMITTED' AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR length(btrim(coalesce(NEW.review_reason,'')))<3)
  THEN RAISE EXCEPTION 'Evidence review attribution required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_evidence BEFORE INSERT OR UPDATE OR DELETE ON app.evidence FOR EACH ROW EXECUTE FUNCTION app.guard_evidence();
CREATE FUNCTION app.bump_activity_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid uuid;
BEGIN
 IF TG_TABLE_NAME='activity_participants' THEN aid=NEW.activity_id;
 ELSE SELECT activity_id INTO aid FROM app.activity_participants WHERE school_id=NEW.school_id AND id=NEW.participant_id; END IF;
 UPDATE app.activities SET data_version=data_version+1 WHERE school_id=NEW.school_id AND id=aid;
 RETURN NEW;
END $$;
CREATE TRIGGER activity_participant_source AFTER INSERT OR UPDATE ON app.activity_participants FOR EACH ROW EXECUTE FUNCTION app.bump_activity_source();
CREATE TRIGGER evidence_activity_source AFTER INSERT OR UPDATE ON app.evidence FOR EACH ROW EXECUTE FUNCTION app.bump_activity_source();
CREATE FUNCTION app.guard_activity_conduct_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_kind='ACTIVITY' AND NEW.status<>'EXCLUDED' AND NOT EXISTS(SELECT 1 FROM app.activity_participants p JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id
   WHERE p.school_id=NEW.school_id AND p.id=NEW.source_id AND p.class_id=NEW.class_id AND p.enrollment_id=NEW.enrollment_id AND p.cancelled_at IS NULL AND p.status='APPROVED'
   AND a.status IN ('ASSIGNED','CLOSED') AND a.assigned_at<=NEW.occurred_at AND p.created_at<=NEW.occurred_at)
  THEN RAISE EXCEPTION 'Activity conduct source invalid' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER activity_conduct_source BEFORE INSERT OR UPDATE ON app.conduct_records FOR EACH ROW EXECUTE FUNCTION app.guard_activity_conduct_source();
REVOKE DELETE ON app.activities,app.activity_participants,app.evidence FROM edu_app,edu_worker;
COMMIT;
