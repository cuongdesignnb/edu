BEGIN;
ALTER TABLE app.duty_group_plans ADD COLUMN enrollment_targets uuid[];
CREATE FUNCTION app.guard_duty_selected_targets() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.enrollment_targets IS NULL THEN RETURN NEW; END IF;
 IF cardinality(NEW.enrollment_targets)<1 OR cardinality(NEW.enrollment_targets)>5000
  OR cardinality(NEW.enrollment_targets)<>(SELECT count(DISTINCT x) FROM unnest(NEW.enrollment_targets) x)
  OR EXISTS(SELECT 1 FROM unnest(NEW.enrollment_targets) x WHERE x IS NULL OR NOT EXISTS(
   SELECT 1 FROM app.enrollments e WHERE e.school_id=NEW.school_id AND e.class_id=NEW.class_id AND e.id=x
    AND e.status<>'CANCELLED' AND e.starts_on<=NEW.duty_date AND (e.ends_on IS NULL OR e.ends_on>NEW.duty_date))) THEN
  RAISE EXCEPTION 'Invalid selected duty targets' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_duty_selected_targets() FROM PUBLIC;
CREATE TRIGGER guard_duty_selected_targets BEFORE INSERT OR UPDATE ON app.duty_group_plans
 FOR EACH ROW EXECUTE FUNCTION app.guard_duty_selected_targets();
COMMIT;
