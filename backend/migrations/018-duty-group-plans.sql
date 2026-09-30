BEGIN;
CREATE TABLE app.duty_group_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,class_id uuid NOT NULL,schedule_id uuid NOT NULL,group_id uuid NOT NULL,
 duty_date date NOT NULL,task text NOT NULL,status text NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN('ASSIGNED','DONE','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),UNIQUE(school_id,id,schedule_id,class_id),UNIQUE(school_id,schedule_id,group_id,duty_date,task),
 FOREIGN KEY(school_id) REFERENCES platform.schools(id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,schedule_id,class_id) REFERENCES app.duty_schedules(school_id,id,class_id) ON DELETE RESTRICT,
 FOREIGN KEY(school_id,group_id,class_id) REFERENCES app.class_groups(school_id,id,class_id) ON DELETE RESTRICT
);
CREATE INDEX duty_group_schedule_lookup ON app.duty_group_plans(school_id,schedule_id,class_id);
CREATE INDEX duty_group_lookup ON app.duty_group_plans(school_id,group_id,class_id);
ALTER TABLE app.duty_group_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.duty_group_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.duty_group_plans TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON app.duty_group_plans TO edu_app,edu_worker;
CREATE TRIGGER z_touch BEFORE UPDATE ON app.duty_group_plans FOR EACH ROW EXECUTE FUNCTION app.touch_row();
CREATE FUNCTION app.guard_duty_group_plan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d app.duty_schedules; sid uuid; pid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 pid:=CASE WHEN TG_OP='DELETE' THEN OLD.schedule_id ELSE NEW.schedule_id END;
 SELECT * INTO d FROM app.duty_schedules WHERE school_id=sid AND id=pid FOR UPDATE;
 IF NOT FOUND OR d.status<>'DRAFT' THEN RAISE EXCEPTION 'Published duty group plans are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (OLD.school_id,OLD.class_id,OLD.schedule_id,OLD.group_id) IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.schedule_id,NEW.group_id) THEN
  RAISE EXCEPTION 'Duty group identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.class_id<>d.class_id OR NEW.duty_date<d.starts_on OR NEW.duty_date>=d.ends_on THEN
  RAISE EXCEPTION 'Duty group date outside schedule' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_duty_group_plan BEFORE INSERT OR UPDATE OR DELETE ON app.duty_group_plans FOR EACH ROW EXECUTE FUNCTION app.guard_duty_group_plan();
CREATE TRIGGER bump_schedule_source AFTER INSERT OR UPDATE OR DELETE ON app.duty_group_plans FOR EACH ROW EXECUTE FUNCTION app.bump_schedule_source();
ALTER TABLE app.duty_assignments ADD COLUMN group_plan_id uuid;
ALTER TABLE app.duty_assignments ADD CONSTRAINT duty_group_plan_fk FOREIGN KEY(school_id,group_plan_id,schedule_id,class_id) REFERENCES app.duty_group_plans(school_id,id,schedule_id,class_id) ON DELETE RESTRICT;
CREATE INDEX duty_group_plan_lookup ON app.duty_assignments(school_id,group_plan_id);
COMMIT;
