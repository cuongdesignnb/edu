BEGIN;
ALTER TABLE app.classes ADD COLUMN notebook_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE app.position_bonus_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,class_id uuid NOT NULL,period_id uuid NOT NULL,
 enrollment_id uuid NOT NULL,position_id uuid NOT NULL,assignment_id uuid NOT NULL,label text NOT NULL,points numeric(10,2) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(school_id,id),UNIQUE(school_id,period_id,enrollment_id,position_id),
 FOREIGN KEY(school_id,period_id) REFERENCES app.conduct_periods(school_id,id),
 FOREIGN KEY(school_id,enrollment_id) REFERENCES app.enrollments(school_id,id),
 FOREIGN KEY(school_id,position_id) REFERENCES app.class_positions(school_id,id),
 FOREIGN KEY(school_id,assignment_id) REFERENCES app.position_assignments(school_id,id));
ALTER TABLE app.position_bonus_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.position_bonus_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.position_bonus_snapshots TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id());
GRANT SELECT,INSERT ON app.position_bonus_snapshots TO edu_app;
GRANT SELECT ON app.position_bonus_snapshots TO edu_worker;
CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON app.position_bonus_snapshots FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();
CREATE FUNCTION app.guard_position_bonus() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.conduct_periods WHERE school_id=NEW.school_id AND id=NEW.period_id AND status='OPEN') THEN
 RAISE EXCEPTION 'Bonus requires open weekly source' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER guard_bonus BEFORE INSERT ON app.position_bonus_snapshots FOR EACH ROW EXECUTE FUNCTION app.guard_position_bonus();
COMMIT;
