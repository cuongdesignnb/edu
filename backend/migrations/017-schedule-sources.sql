BEGIN;
ALTER TABLE app.timetable_versions ADD COLUMN data_version integer NOT NULL DEFAULT 1 CHECK(data_version>0);
ALTER TABLE app.duty_schedules ADD COLUMN data_version integer NOT NULL DEFAULT 1 CHECK(data_version>0);
ALTER TABLE app.timetable_versions ADD COLUMN published_at timestamptz;
ALTER TABLE app.duty_schedules ADD COLUMN published_at timestamptz;
ALTER TABLE app.lesson_occurrences ADD COLUMN entry_id uuid;
ALTER TABLE app.lesson_occurrences ADD COLUMN period_number integer CHECK(period_number>0);
ALTER TABLE app.lesson_occurrences ADD CONSTRAINT lesson_entry_fk FOREIGN KEY(school_id,entry_id) REFERENCES app.timetable_entries(school_id,id) ON DELETE RESTRICT;
CREATE INDEX lesson_entry_lookup ON app.lesson_occurrences(school_id,entry_id);
CREATE FUNCTION app.guard_schedule_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE y app.academic_years;
BEGIN
 SELECT * INTO y FROM app.academic_years WHERE school_id=NEW.school_id AND id=NEW.year_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.classes c WHERE c.school_id=NEW.school_id AND c.id=NEW.class_id AND c.year_id=NEW.year_id)
  OR NEW.starts_on<y.starts_on OR NEW.ends_on>y.ends_on OR NEW.ends_on-NEW.starts_on>366 THEN
  RAISE EXCEPTION 'Schedule outside class/year' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (OLD.school_id,OLD.class_id,OLD.year_id,OLD.created_by) IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.year_id,NEW.created_by) THEN
   RAISE EXCEPTION 'Schedule identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status IN('PUBLISHED','ARCHIVED') AND ((OLD.starts_on,OLD.ends_on) IS DISTINCT FROM (NEW.starts_on,NEW.ends_on)
   OR NEW.status NOT IN('PUBLISHED','ARCHIVED')) THEN
   RAISE EXCEPTION 'Published schedule is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_schedule_source BEFORE INSERT OR UPDATE ON app.timetable_versions FOR EACH ROW EXECUTE FUNCTION app.guard_schedule_source();
CREATE TRIGGER guard_schedule_source BEFORE INSERT OR UPDATE ON app.duty_schedules FOR EACH ROW EXECUTE FUNCTION app.guard_schedule_source();
CREATE FUNCTION app.guard_schedule_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record; e app.enrollments; sid uuid; pid uuid; cid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 cid:=CASE WHEN TG_OP='DELETE' THEN OLD.class_id ELSE NEW.class_id END;
 IF TG_TABLE_NAME='timetable_entries' THEN
  pid:=CASE WHEN TG_OP='DELETE' THEN OLD.timetable_id ELSE NEW.timetable_id END;
  SELECT * INTO s FROM app.timetable_versions WHERE school_id=sid AND id=pid FOR UPDATE;
 ELSE
  pid:=CASE WHEN TG_OP='DELETE' THEN OLD.schedule_id ELSE NEW.schedule_id END;
  SELECT * INTO s FROM app.duty_schedules WHERE school_id=sid AND id=pid FOR UPDATE;
 END IF;
 IF NOT FOUND OR s.class_id<>cid OR s.status<>'DRAFT' THEN RAISE EXCEPTION 'Published schedule children are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (OLD.school_id,OLD.class_id) IS DISTINCT FROM (NEW.school_id,NEW.class_id) THEN
  RAISE EXCEPTION 'Schedule child identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='duty_assignments' THEN
  SELECT * INTO e FROM app.enrollments WHERE school_id=NEW.school_id AND id=NEW.enrollment_id AND class_id=NEW.class_id;
  IF NOT FOUND OR e.status='CANCELLED' OR NEW.duty_date<s.starts_on OR NEW.duty_date>=s.ends_on OR NEW.duty_date<e.starts_on OR NEW.duty_date>=e.ends_on THEN
   RAISE EXCEPTION 'Duty outside effective enrollment/schedule' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_schedule_child BEFORE INSERT OR UPDATE OR DELETE ON app.timetable_entries FOR EACH ROW EXECUTE FUNCTION app.guard_schedule_child();
CREATE TRIGGER guard_schedule_child BEFORE INSERT OR UPDATE OR DELETE ON app.duty_assignments FOR EACH ROW EXECUTE FUNCTION app.guard_schedule_child();
CREATE FUNCTION app.bump_schedule_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid uuid; pid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 IF TG_TABLE_NAME='timetable_entries' THEN
  pid:=CASE WHEN TG_OP='DELETE' THEN OLD.timetable_id ELSE NEW.timetable_id END;
  UPDATE app.timetable_versions SET data_version=data_version+1 WHERE school_id=sid AND id=pid;
 ELSE
  pid:=CASE WHEN TG_OP='DELETE' THEN OLD.schedule_id ELSE NEW.schedule_id END;
  UPDATE app.duty_schedules SET data_version=data_version+1 WHERE school_id=sid AND id=pid;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER bump_schedule_source AFTER INSERT OR UPDATE OR DELETE ON app.timetable_entries FOR EACH ROW EXECUTE FUNCTION app.bump_schedule_source();
CREATE TRIGGER bump_schedule_source AFTER INSERT OR UPDATE OR DELETE ON app.duty_assignments FOR EACH ROW EXECUTE FUNCTION app.bump_schedule_source();
CREATE FUNCTION app.guard_lesson_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.school_id,OLD.class_id,OLD.timetable_id,OLD.subject_id,OLD.member_id,OLD.room_id,OLD.starts_at,OLD.ends_at,OLD.entry_id,OLD.period_number)
  IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.timetable_id,NEW.subject_id,NEW.member_id,NEW.room_id,NEW.starts_at,NEW.ends_at,NEW.entry_id,NEW.period_number)
  OR OLD.starts_at<=now() OR (OLD.status='CANCELLED' AND NEW.status<>'CANCELLED') THEN
  RAISE EXCEPTION 'Lesson history is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status='CANCELLED' AND (EXISTS(SELECT 1 FROM app.attendance_sessions s WHERE s.school_id=OLD.school_id AND s.lesson_id=OLD.id)
  OR EXISTS(SELECT 1 FROM app.conduct_records r WHERE r.school_id=OLD.school_id AND r.lesson_id=OLD.id AND r.status<>'EXCLUDED')) THEN
  RAISE EXCEPTION 'Lesson already has source records' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_lesson_history BEFORE UPDATE ON app.lesson_occurrences FOR EACH ROW EXECUTE FUNCTION app.guard_lesson_history();
REVOKE DELETE ON app.timetable_versions,app.duty_schedules,app.lesson_occurrences FROM edu_app,edu_worker;
COMMIT;
