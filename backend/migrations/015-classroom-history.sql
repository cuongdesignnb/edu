BEGIN;
ALTER TABLE app.class_positions ADD COLUMN group_id uuid;
ALTER TABLE app.class_positions ADD CONSTRAINT position_group_class_fk FOREIGN KEY(school_id,group_id,class_id)
 REFERENCES app.class_groups(school_id,id,class_id) ON DELETE RESTRICT;
CREATE INDEX position_group_lookup ON app.class_positions(school_id,group_id,class_id);
ALTER TABLE app.group_memberships ADD COLUMN cancelled_at timestamptz;
ALTER TABLE app.position_assignments ADD COLUMN cancelled_at timestamptz;
ALTER TABLE app.position_assignments ADD COLUMN single_holder boolean NOT NULL DEFAULT false;
DO $$ DECLARE s record; BEGIN
 FOR s IN SELECT id FROM platform.schools LOOP
  PERFORM set_config('app.school_id',s.id::text,true);
  UPDATE app.position_assignments a SET single_holder=p.single_holder,ends_on=coalesce(a.ends_on,e.ends_on,y.ends_on)
   FROM app.class_positions p,app.enrollments e,app.academic_years y WHERE a.school_id=s.id AND p.school_id=a.school_id AND p.id=a.position_id
   AND e.school_id=a.school_id AND e.id=a.enrollment_id AND y.school_id=e.school_id AND y.id=e.year_id;
  UPDATE app.group_memberships a SET ends_on=coalesce(a.ends_on,e.ends_on,y.ends_on) FROM app.enrollments e,app.academic_years y
   WHERE a.school_id=s.id AND e.school_id=a.school_id AND e.id=a.enrollment_id AND y.school_id=e.school_id AND y.id=e.year_id;
 END LOOP;
 PERFORM set_config('app.school_id','',true);
END $$;
ALTER TABLE app.group_memberships DROP CONSTRAINT no_group_overlap;
ALTER TABLE app.group_memberships ADD CONSTRAINT no_group_overlap EXCLUDE USING gist
 (school_id WITH =,enrollment_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&) WHERE(cancelled_at IS NULL);
ALTER TABLE app.position_assignments ADD CONSTRAINT no_position_duplicate EXCLUDE USING gist
 (school_id WITH =,position_id WITH =,enrollment_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&) WHERE(cancelled_at IS NULL);
ALTER TABLE app.position_assignments ADD CONSTRAINT no_single_holder_overlap EXCLUDE USING gist
 (school_id WITH =,position_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&) WHERE(single_holder AND cancelled_at IS NULL);

CREATE FUNCTION app.guard_classroom_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
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
 END IF;
 SELECT * INTO e FROM app.enrollments WHERE school_id=NEW.school_id AND id=NEW.enrollment_id AND class_id=NEW.class_id;
 SELECT coalesce(e.ends_on,y.ends_on) INTO until_day FROM app.academic_years y WHERE y.school_id=e.school_id AND y.id=e.year_id;
 IF e.id IS NULL OR e.status='CANCELLED' OR NEW.starts_on<e.starts_on OR NEW.ends_on IS NULL OR NEW.ends_on>until_day
  THEN RAISE EXCEPTION 'Assignment outside enrollment' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='position_assignments' THEN
  SELECT * INTO p FROM app.class_positions WHERE school_id=NEW.school_id AND id=NEW.position_id AND class_id=NEW.class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Position not found' USING ERRCODE='23514'; END IF;
  NEW.single_holder:=p.single_holder;
  IF NEW.cancelled_at IS NULL AND p.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.group_memberships g
   WHERE g.school_id=NEW.school_id AND g.group_id=p.group_id AND g.enrollment_id=NEW.enrollment_id AND g.cancelled_at IS NULL
    AND g.starts_on<=NEW.starts_on AND g.ends_on>=NEW.ends_on) THEN
   RAISE EXCEPTION 'Group position requires dated group membership' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_classroom_assignment BEFORE INSERT OR UPDATE ON app.group_memberships FOR EACH ROW EXECUTE FUNCTION app.guard_classroom_assignment();
CREATE TRIGGER guard_classroom_assignment BEFORE INSERT OR UPDATE ON app.position_assignments FOR EACH ROW EXECUTE FUNCTION app.guard_classroom_assignment();
CREATE FUNCTION app.guard_position_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.school_id,OLD.class_id,OLD.code,OLD.group_id) IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.code,NEW.group_id)
  OR (OLD.single_holder<>NEW.single_holder AND EXISTS(SELECT 1 FROM app.position_assignments a WHERE a.school_id=OLD.school_id AND a.position_id=OLD.id AND a.cancelled_at IS NULL)) THEN
  RAISE EXCEPTION 'Position definition in use' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_position_definition BEFORE UPDATE ON app.class_positions FOR EACH ROW EXECUTE FUNCTION app.guard_position_definition();

ALTER TABLE app.seating_plans ADD COLUMN ends_on date;
ALTER TABLE app.seating_plans ADD CONSTRAINT seating_dates CHECK(ends_on IS NULL OR ends_on>effective_on);
DROP INDEX app.uq_active_seating;
ALTER TABLE app.seating_plans ADD CONSTRAINT no_seating_overlap EXCLUDE USING gist
 (school_id WITH =,class_id WITH =,daterange(effective_on,ends_on,'[)') WITH &&) WHERE(status='ACTIVE');
CREATE FUNCTION app.guard_seating_plan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE y app.academic_years;
BEGIN
 SELECT y1.* INTO y FROM app.academic_years y1 JOIN app.classes c ON c.school_id=y1.school_id AND c.year_id=y1.id WHERE c.school_id=NEW.school_id AND c.id=NEW.class_id;
 IF NEW.effective_on<y.starts_on OR NEW.effective_on>=y.ends_on OR NEW.ends_on>y.ends_on THEN
  RAISE EXCEPTION 'Seating outside academic year' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' AND (OLD.school_id,OLD.class_id,OLD.revision,OLD.effective_on,OLD.layout,OLD.created_by)
  IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.revision,NEW.effective_on,NEW.layout,NEW.created_by) THEN
  RAISE EXCEPTION 'Activated seating content is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'DRAFT' AND NEW.status='DRAFT' THEN
  RAISE EXCEPTION 'Activated seating cannot become a draft' USING ERRCODE='23514'; END IF;
 IF NEW.status='ACTIVE' AND (TG_OP='INSERT' OR OLD.status='DRAFT') THEN
  IF EXISTS(SELECT 1 FROM app.seat_assignments a LEFT JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id AND e.class_id=a.class_id
   WHERE a.school_id=NEW.school_id AND a.plan_id=NEW.id AND a.enrollment_id IS NOT NULL
   AND (e.id IS NULL OR e.status='CANCELLED' OR e.starts_on>NEW.effective_on OR e.ends_on<=NEW.effective_on)) THEN
   RAISE EXCEPTION 'Seat outside effective roster' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_seating_plan BEFORE INSERT OR UPDATE ON app.seating_plans FOR EACH ROW EXECUTE FUNCTION app.guard_seating_plan();
CREATE FUNCTION app.guard_seating_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p app.seating_plans; sid uuid; pid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 pid:=CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
 SELECT * INTO p FROM app.seating_plans WHERE school_id=sid AND id=pid FOR UPDATE;
 IF NOT FOUND OR p.status<>'DRAFT' THEN RAISE EXCEPTION 'Activated seats are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.school_id,OLD.class_id,OLD.plan_id) IS DISTINCT FROM (NEW.school_id,NEW.class_id,NEW.plan_id) THEN
  RAISE EXCEPTION 'Seat identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_seating_child BEFORE INSERT OR UPDATE OR DELETE ON app.seat_assignments FOR EACH ROW EXECUTE FUNCTION app.guard_seating_child();
REVOKE DELETE ON app.group_memberships,app.position_assignments,app.seating_plans FROM edu_app,edu_worker;
COMMIT;
