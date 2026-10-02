BEGIN;
CREATE TABLE app.lesson_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
 class_id uuid NOT NULL, year_id uuid NOT NULL, lesson_id uuid NOT NULL,
 lesson_version integer NOT NULL CHECK(lesson_version>0), lesson_date date NOT NULL,
 period_number integer NOT NULL CHECK(period_number>0),
 kind text NOT NULL CHECK(kind IN('swap','substitute','room','cancel')),
 subject_id uuid, member_id uuid, room_id uuid,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 4000),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED','DISCARDED')),
 timetable_id uuid, created_by uuid NOT NULL REFERENCES identity.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(school_id,id),
 FOREIGN KEY(school_id,class_id,year_id) REFERENCES app.classes(school_id,id,year_id),
 FOREIGN KEY(school_id,lesson_id) REFERENCES app.lesson_occurrences(school_id,id),
 FOREIGN KEY(school_id,subject_id) REFERENCES app.subjects(school_id,id),
 FOREIGN KEY(school_id,member_id) REFERENCES app.memberships(school_id,id),
 FOREIGN KEY(school_id,room_id) REFERENCES app.rooms(school_id,id),
 FOREIGN KEY(school_id,timetable_id) REFERENCES app.timetable_versions(school_id,id)
);
CREATE UNIQUE INDEX lesson_change_draft_slot ON app.lesson_changes(school_id,class_id,lesson_date,period_number) WHERE status='DRAFT';
CREATE INDEX lesson_change_week ON app.lesson_changes(school_id,lesson_date,class_id);
CREATE FUNCTION app.guard_lesson_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source app.lesson_occurrences; yr app.academic_years; zone text;
BEGIN
 SELECT * INTO source FROM app.lesson_occurrences WHERE school_id=NEW.school_id AND id=NEW.lesson_id;
 SELECT * INTO yr FROM app.academic_years WHERE school_id=NEW.school_id AND id=NEW.year_id;
 SELECT timezone INTO zone FROM platform.schools WHERE id=NEW.school_id;
 IF source.id IS NULL OR source.class_id<>NEW.class_id OR source.period_number IS DISTINCT FROM NEW.period_number
  OR (source.starts_at AT TIME ZONE zone)::date<>NEW.lesson_date OR NEW.lesson_date<yr.starts_on OR NEW.lesson_date>=yr.ends_on THEN
  RAISE EXCEPTION 'Invalid lesson change source' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'DRAFT' OR (OLD.school_id,OLD.class_id,OLD.year_id,OLD.lesson_id,OLD.lesson_date,OLD.period_number,OLD.created_by)
    IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.year_id,NEW.lesson_id,NEW.lesson_date,NEW.period_number,NEW.created_by) THEN
   RAISE EXCEPTION 'Published lesson change is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_lesson_change BEFORE INSERT OR UPDATE ON app.lesson_changes FOR EACH ROW EXECUTE FUNCTION app.guard_lesson_change();
CREATE TRIGGER z_touch BEFORE UPDATE ON app.lesson_changes FOR EACH ROW EXECUTE FUNCTION app.touch_row();
ALTER TABLE app.lesson_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.lesson_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.lesson_changes TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id());
GRANT SELECT,INSERT,UPDATE ON app.lesson_changes TO edu_app,edu_worker;
GRANT ALL ON app.lesson_changes TO edu_migrator;
COMMIT;
