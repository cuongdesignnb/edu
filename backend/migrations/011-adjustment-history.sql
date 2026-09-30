BEGIN;
ALTER TABLE app.adjustment_requests ADD COLUMN preview jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.adjustment_requests ADD COLUMN decision_reason text;
ALTER TABLE app.adjustment_requests ADD COLUMN result_publication_id uuid;
ALTER TABLE app.adjustment_requests ADD CONSTRAINT adjustment_result FOREIGN KEY(school_id,result_publication_id) REFERENCES app.publication_revisions(school_id,id);
CREATE FUNCTION app.guard_adjustment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Adjustment history retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'SUBMITTED' OR NEW.baseline_source_version IS NULL OR NEW.baseline_source_version<1
   OR jsonb_typeof(NEW.proposed_changes)<>'array' OR jsonb_array_length(NEW.proposed_changes) NOT BETWEEN 1 AND 100
   OR length(btrim(NEW.reason))<5 THEN RAISE EXCEPTION 'Invalid adjustment proposal' USING ERRCODE='23514'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','decided_by','decided_at','applied_at','decision_reason','result_publication_id','version','updated_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decided_by','decided_at','applied_at','decision_reason','result_publication_id','version','updated_at'])
   THEN RAISE EXCEPTION 'Adjustment proposal immutable' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD.status='SUBMITTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR
    (OLD.status='APPROVED' AND NEW.status IN ('APPLIED','REJECTED','CANCELLED'))) THEN RAISE EXCEPTION 'Invalid adjustment transition' USING ERRCODE='23514'; END IF;
  IF NEW.status IN ('APPROVED','REJECTED') AND (NEW.decided_by IS NULL OR NEW.decided_at IS NULL) THEN RAISE EXCEPTION 'Decision attribution required' USING ERRCODE='23514'; END IF;
  IF NEW.status='REJECTED' AND (NEW.decision_reason IS NULL OR length(btrim(NEW.decision_reason))<5) THEN RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='APPLIED' AND (NEW.applied_at IS NULL OR NEW.result_publication_id IS NULL) THEN RAISE EXCEPTION 'Published correction required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_adjustment_history BEFORE INSERT OR UPDATE OR DELETE ON app.adjustment_requests FOR EACH ROW EXECUTE FUNCTION app.guard_adjustment_history();
COMMIT;
