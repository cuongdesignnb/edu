-- Native rule editor metadata; existing issued rules and revisions stay immutable.
ALTER TABLE app.rule_sets ADD COLUMN effective_from date,
 ADD COLUMN entry_deadline_days integer CHECK(entry_deadline_days BETWEEN 0 AND 365),
 ADD COLUMN created_by uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
 ADD COLUMN discarded_at timestamptz;
ALTER TABLE app.conduct_rules ADD COLUMN icon text NOT NULL DEFAULT 'alert',
 ADD COLUMN share_with_parent boolean NOT NULL DEFAULT true;
ALTER TABLE app.rule_thresholds ADD COLUMN tone text NOT NULL DEFAULT 'neutral'
 CHECK(tone IN ('neutral','success','info','warning','danger'));
-- Freeze the public-detail choice on each record, independently of future rules.
ALTER TABLE app.conduct_records ADD COLUMN share_with_parent_snapshot boolean NOT NULL DEFAULT true;
CREATE FUNCTION app.capture_conduct_rule_sharing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT share_with_parent INTO NEW.share_with_parent_snapshot FROM app.conduct_rules
 WHERE school_id=NEW.school_id AND id=NEW.rule_id AND rule_set_id=NEW.rule_set_id;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_conduct_rule_sharing BEFORE INSERT ON app.conduct_records
 FOR EACH ROW EXECUTE FUNCTION app.capture_conduct_rule_sharing();
CREATE FUNCTION app.guard_conduct_rule_sharing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.share_with_parent_snapshot IS DISTINCT FROM OLD.share_with_parent_snapshot THEN
 RAISE EXCEPTION 'Conduct public detail choice immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_conduct_rule_sharing BEFORE UPDATE ON app.conduct_records
 FOR EACH ROW EXECUTE FUNCTION app.guard_conduct_rule_sharing();
CREATE FUNCTION app.guard_discarded_rule_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.discarded_at IS NOT NULL THEN RAISE EXCEPTION 'Discarded rule draft immutable' USING ERRCODE='23514'; END IF;
 IF NEW.discarded_at IS NOT NULL AND (OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR
 EXISTS(SELECT 1 FROM app.class_rule_periods WHERE school_id=OLD.school_id AND rule_set_id=OLD.id) OR
 EXISTS(SELECT 1 FROM app.conduct_periods WHERE school_id=OLD.school_id AND rule_set_id=OLD.id)) THEN
 RAISE EXCEPTION 'Only an unused draft can be discarded' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_discarded_rule_set BEFORE UPDATE ON app.rule_sets
 FOR EACH ROW EXECUTE FUNCTION app.guard_discarded_rule_set();
