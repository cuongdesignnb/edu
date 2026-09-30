BEGIN;
ALTER TABLE app.attendance_sessions ADD COLUMN data_version integer NOT NULL DEFAULT 1 CHECK(data_version>0);
ALTER TABLE app.attendance_sessions DROP CONSTRAINT attendance_sessions_check;
ALTER TABLE app.attendance_sessions ADD CONSTRAINT attendance_slot CHECK(
 (granularity='DAILY' AND lesson_id IS NULL AND slot_key IN ('daily','morning','afternoon')) OR
 (granularity='LESSON' AND lesson_id IS NOT NULL AND slot_key=lesson_id::text));
CREATE FUNCTION app.guard_attendance_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s app.attendance_sessions; e app.enrollments;
BEGIN
 SELECT * INTO s FROM app.attendance_sessions WHERE school_id=coalesce(NEW.school_id,OLD.school_id) AND id=coalesce(NEW.session_id,OLD.session_id) FOR UPDATE;
 IF s.status='LOCKED' THEN RAISE EXCEPTION 'Attendance locked' USING ERRCODE='23514'; END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT * INTO e FROM app.enrollments WHERE school_id=NEW.school_id AND id=NEW.enrollment_id;
  IF e.id IS NULL OR e.class_id<>s.class_id OR e.year_id<>s.year_id OR e.status='CANCELLED'
   OR e.starts_on>s.session_date OR (e.ends_on IS NOT NULL AND e.ends_on<=s.session_date)
   OR NEW.class_id<>s.class_id THEN RAISE EXCEPTION 'Attendance enrollment outside session' USING ERRCODE='23514'; END IF;
  IF (NEW.status<>'LATE' AND coalesce(NEW.late_minutes,0)<>0) THEN RAISE EXCEPTION 'Minutes require late status' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER a_guard_attendance BEFORE INSERT OR UPDATE OR DELETE ON app.attendance_records FOR EACH ROW EXECUTE FUNCTION app.guard_attendance_record();
CREATE FUNCTION app.bump_attendance_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE app.attendance_sessions SET data_version=data_version+1 WHERE school_id=coalesce(NEW.school_id,OLD.school_id) AND id=coalesce(NEW.session_id,OLD.session_id);
 RETURN NULL;
END $$;
CREATE TRIGGER bump_attendance_source AFTER INSERT OR UPDATE OR DELETE ON app.attendance_records FOR EACH ROW EXECUTE FUNCTION app.bump_attendance_source();
CREATE INDEX attendance_date_idx ON app.attendance_sessions(school_id,class_id,session_date,granularity,slot_key);
COMMIT;
