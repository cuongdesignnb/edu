BEGIN;
CREATE OR REPLACE FUNCTION app.guard_classroom_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e app.enrollments; p app.class_positions; until_day date;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (OLD.school_id,OLD.class_id,OLD.enrollment_id,OLD.starts_on) IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.enrollment_id,NEW.starts_on)
    OR (OLD.cancelled_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
   RAISE EXCEPTION 'Assignment history is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='position_assignments' THEN
   IF OLD.position_id<>NEW.position_id THEN RAISE EXCEPTION 'Position identity is immutable' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM app.conduct_records r JOIN app.conduct_periods c ON c.school_id=r.school_id AND c.id=r.period_id
    JOIN platform.schools s ON s.id=r.school_id WHERE r.school_id=NEW.school_id AND r.source_kind='POSITION' AND r.source_id=NEW.id
    AND r.status='APPROVED' AND c.status='LOCKED' AND (NEW.cancelled_at IS NOT NULL OR NEW.ends_on<=(r.occurred_at AT TIME ZONE s.timezone)::date)) THEN
     RAISE EXCEPTION 'Locked conduct source must be preserved' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD.group_id<>NEW.group_id THEN RAISE EXCEPTION 'Group identity is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  -- A cancelled future interval retains its original dates even when the
  -- student's enrollment has just ended before it starts.
  IF NEW.cancelled_at IS NOT NULL THEN
   IF TG_TABLE_NAME='position_assignments' THEN NEW.single_holder:=OLD.single_holder; END IF;
   RETURN NEW;
  END IF;
 ELSIF NEW.cancelled_at IS NOT NULL THEN
  RAISE EXCEPTION 'New assignments cannot start cancelled' USING ERRCODE='23514';
 END IF;
 SELECT * INTO e FROM app.enrollments WHERE school_id=NEW.school_id AND id=NEW.enrollment_id AND class_id=NEW.class_id;
 SELECT coalesce(e.ends_on,y.ends_on) INTO until_day FROM app.academic_years y WHERE y.school_id=e.school_id AND y.id=e.year_id;
 IF e.id IS NULL OR e.status='CANCELLED' OR NEW.starts_on<e.starts_on OR NEW.ends_on IS NULL OR NEW.ends_on>until_day
  THEN RAISE EXCEPTION 'Assignment outside enrollment' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='position_assignments' THEN
  SELECT * INTO p FROM app.class_positions WHERE school_id=NEW.school_id AND id=NEW.position_id AND class_id=NEW.class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Position not found' USING ERRCODE='23514'; END IF;
  NEW.single_holder:=p.single_holder;
  IF p.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.group_memberships g
   WHERE g.school_id=NEW.school_id AND g.group_id=p.group_id AND g.enrollment_id=NEW.enrollment_id AND g.cancelled_at IS NULL
    AND g.starts_on<=NEW.starts_on AND g.ends_on>=NEW.ends_on) THEN
   RAISE EXCEPTION 'Group position requires dated group membership' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION app.end_enrollment_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cutoff date;
BEGIN
 cutoff:=CASE WHEN NEW.status='CANCELLED' THEN NEW.starts_on ELSE NEW.ends_on END;
 IF cutoff IS NULL THEN RETURN NEW; END IF;
 -- Close positions before group membership so the group-position invariant
 -- remains true throughout the same transaction. Locked score sources deny.
 UPDATE app.position_assignments SET ends_on=cutoff WHERE school_id=NEW.school_id AND enrollment_id=NEW.id
  AND cancelled_at IS NULL AND starts_on<cutoff AND ends_on>cutoff;
 UPDATE app.position_assignments SET cancelled_at=now() WHERE school_id=NEW.school_id AND enrollment_id=NEW.id
  AND cancelled_at IS NULL AND starts_on>=cutoff;
 UPDATE app.group_memberships SET ends_on=cutoff WHERE school_id=NEW.school_id AND enrollment_id=NEW.id
  AND cancelled_at IS NULL AND starts_on<cutoff AND ends_on>cutoff;
 UPDATE app.group_memberships SET cancelled_at=now() WHERE school_id=NEW.school_id AND enrollment_id=NEW.id
  AND cancelled_at IS NULL AND starts_on>=cutoff;
 RETURN NEW;
END $$;
CREATE TRIGGER end_enrollment_organization AFTER UPDATE ON app.enrollments
 FOR EACH ROW WHEN(OLD.ends_on IS DISTINCT FROM NEW.ends_on OR OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION app.end_enrollment_organization();
COMMIT;
