BEGIN;
-- The handoff has class HOMEROOM exclusion, but also requires one homeroom
-- class per teacher/year and one teacher per subject/class at a time.
ALTER TABLE app.teaching_assignments ADD COLUMN year_id uuid;
DO $$ DECLARE tenant uuid; BEGIN
 FOR tenant IN SELECT id FROM platform.schools LOOP
  PERFORM set_config('app.school_id',tenant::text,true);
  UPDATE app.teaching_assignments a SET year_id=c.year_id FROM app.classes c
  WHERE c.school_id=a.school_id AND c.id=a.class_id;
 END LOOP;
 PERFORM set_config('app.school_id','',true);
END $$;
ALTER TABLE app.teaching_assignments ALTER COLUMN year_id SET NOT NULL;
ALTER TABLE app.teaching_assignments ADD CONSTRAINT assignment_class_year
FOREIGN KEY(school_id,class_id,year_id) REFERENCES app.classes(school_id,id,year_id);
ALTER TABLE app.teaching_assignments ADD CONSTRAINT no_teacher_homeroom_overlap
EXCLUDE USING gist(school_id WITH =,member_id WITH =,year_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&)
WHERE(kind='HOMEROOM' AND revoked_at IS NULL);
ALTER TABLE app.teaching_assignments ADD CONSTRAINT no_subject_teacher_overlap
EXCLUDE USING gist(school_id WITH =,class_id WITH =,subject_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&)
WHERE(kind='SUBJECT' AND revoked_at IS NULL);
CREATE FUNCTION app.complete_assignment_year() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT year_id INTO NEW.year_id FROM app.classes WHERE school_id=NEW.school_id AND id=NEW.class_id;
 RETURN NEW;
END $$;
CREATE TRIGGER complete_assignment_year BEFORE INSERT OR UPDATE ON app.teaching_assignments
FOR EACH ROW EXECUTE FUNCTION app.complete_assignment_year();
COMMIT;
