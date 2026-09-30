-- Immutable bounded report snapshots and requester-bound private export artifacts.
ALTER TABLE app.export_jobs ADD COLUMN report_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.export_jobs ADD COLUMN content_hash text;
ALTER TABLE app.export_jobs ADD COLUMN scope_fingerprint text;
ALTER TABLE app.export_jobs ADD COLUMN planned_file_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE app.export_jobs ADD COLUMN last_error_code text;
ALTER TABLE app.export_jobs ADD CONSTRAINT export_snapshot_size CHECK(pg_column_size(report_snapshot)<=20971520);
ALTER TABLE app.export_jobs ADD CONSTRAINT export_planned_file_unique UNIQUE(school_id,planned_file_id);
CREATE INDEX export_requester_created_idx ON app.export_jobs(school_id,requested_by,created_at,id);
CREATE OR REPLACE FUNCTION app.immutable_export_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.school_id,NEW.requested_by,NEW.class_id,NEW.report_type,NEW.format,NEW.filters,NEW.report_snapshot,NEW.content_hash,NEW.scope_fingerprint,NEW.planned_file_id)
     IS DISTINCT FROM (OLD.school_id,OLD.requested_by,OLD.class_id,OLD.report_type,OLD.format,OLD.filters,OLD.report_snapshot,OLD.content_hash,OLD.scope_fingerprint,OLD.planned_file_id)
  THEN RAISE EXCEPTION 'Export source is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_export_source BEFORE UPDATE ON app.export_jobs FOR EACH ROW EXECUTE FUNCTION app.immutable_export_source();
