BEGIN;
CREATE TABLE app.periodic_conduct(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,class_id uuid NOT NULL,year_id uuid NOT NULL,
 period_type text NOT NULL CHECK(period_type IN ('MONTH','TERM','YEAR')),period_key text NOT NULL,period_label text NOT NULL,
 starts_on date NOT NULL,ends_on date NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEW','FINALIZED','PUBLISHED')),
 policy_snapshot jsonb NOT NULL,source_publication_ids uuid[] NOT NULL,results jsonb NOT NULL,
 finalized_by uuid REFERENCES identity.users(id),finalized_at timestamptz,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),UNIQUE(school_id,class_id,period_type,period_key),
 FOREIGN KEY(school_id,class_id,year_id) REFERENCES app.classes(school_id,id,year_id),CHECK(ends_on>starts_on));
ALTER TABLE app.publication_revisions ADD COLUMN periodic_conduct_id uuid,
 ADD CONSTRAINT publication_periodic_fk FOREIGN KEY(school_id,periodic_conduct_id) REFERENCES app.periodic_conduct(school_id,id);
ALTER TABLE app.publication_revisions DROP CONSTRAINT publication_revisions_kind_check,
 DROP CONSTRAINT publication_revisions_check,DROP CONSTRAINT publication_revisions_check1;
ALTER TABLE app.publication_revisions ADD CONSTRAINT publication_revisions_kind_check CHECK(kind IN ('CONDUCT','PERIODIC_CONDUCT','ATTENDANCE','TIMETABLE','DUTY','ACTIVITY','ANNOUNCEMENT')),
 ADD CONSTRAINT publication_revisions_check CHECK(num_nonnulls(conduct_period_id,periodic_conduct_id,attendance_session_id,timetable_id,duty_schedule_id,activity_id,announcement_id)=1),
 ADD CONSTRAINT publication_revisions_check1 CHECK((kind='CONDUCT' AND conduct_period_id IS NOT NULL) OR (kind='PERIODIC_CONDUCT' AND periodic_conduct_id IS NOT NULL) OR (kind='ATTENDANCE' AND attendance_session_id IS NOT NULL) OR (kind='TIMETABLE' AND timetable_id IS NOT NULL) OR (kind='DUTY' AND duty_schedule_id IS NOT NULL) OR (kind='ACTIVITY' AND activity_id IS NOT NULL) OR (kind='ANNOUNCEMENT' AND announcement_id IS NOT NULL));
CREATE UNIQUE INDEX uq_periodic_publication ON app.publication_revisions(school_id,periodic_conduct_id) WHERE status='PUBLISHED' AND periodic_conduct_id IS NOT NULL;
CREATE UNIQUE INDEX uq_periodic_revision ON app.publication_revisions(school_id,periodic_conduct_id,revision) WHERE periodic_conduct_id IS NOT NULL;
ALTER TABLE app.periodic_conduct ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.periodic_conduct FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.periodic_conduct TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id());
GRANT SELECT,INSERT,UPDATE ON app.periodic_conduct TO edu_app;
GRANT SELECT ON app.periodic_conduct TO edu_worker;
CREATE FUNCTION app.guard_periodic_conduct() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.status IN ('FINALIZED','PUBLISHED') AND
 (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at'])) THEN
 RAISE EXCEPTION 'Finalized periodic result immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='PUBLISHED' THEN RAISE EXCEPTION 'Published periodic result immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER a_guard_periodic BEFORE UPDATE OR DELETE ON app.periodic_conduct FOR EACH ROW EXECUTE FUNCTION app.guard_periodic_conduct();
CREATE TRIGGER z_touch BEFORE UPDATE ON app.periodic_conduct FOR EACH ROW EXECUTE FUNCTION app.touch_row();
COMMIT;
