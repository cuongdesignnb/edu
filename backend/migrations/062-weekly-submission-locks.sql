BEGIN;
CREATE TABLE app.class_week_settings(
 school_id uuid NOT NULL,class_id uuid NOT NULL,week_id uuid NOT NULL,
 submit_deadline timestamptz,lock_deadline timestamptz,reason text NOT NULL,
 version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,class_id,week_id),FOREIGN KEY(school_id,class_id) REFERENCES app.classes(school_id,id),
 FOREIGN KEY(school_id,week_id) REFERENCES app.school_weeks(school_id,id),
 CHECK(submit_deadline IS NULL OR lock_deadline IS NULL OR lock_deadline>=submit_deadline));
CREATE TABLE app.class_week_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,class_id uuid NOT NULL,week_id uuid NOT NULL,
 officer_assignment_id uuid NOT NULL,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','LOCKED','REOPENED')),
 submitted_at timestamptz,lock_at timestamptz,reopened_until timestamptz,reopened_by uuid REFERENCES identity.users(id),reopen_reason text,
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),UNIQUE(school_id,week_id,officer_assignment_id),
 FOREIGN KEY(school_id,class_id) REFERENCES app.classes(school_id,id),
 FOREIGN KEY(school_id,week_id) REFERENCES app.school_weeks(school_id,id),
 FOREIGN KEY(school_id,officer_assignment_id) REFERENCES app.class_officer_assignments(school_id,id));
CREATE TABLE app.capability_commands(
 school_id uuid NOT NULL,session_id uuid NOT NULL,operation text NOT NULL,key_hash text NOT NULL,request_hash text NOT NULL,
 response_metadata jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,session_id,operation,key_hash));
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['app.class_week_settings','app.class_week_submissions','app.capability_commands'] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id())',target);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %s TO edu_app',target);
 END LOOP;
END $$;
GRANT SELECT,UPDATE ON app.class_week_submissions TO edu_worker;
GRANT SELECT ON app.class_week_settings TO edu_worker;
GRANT INSERT ON app.audit_events TO edu_worker;
CREATE TRIGGER z_touch BEFORE UPDATE ON app.class_week_submissions FOR EACH ROW EXECUTE FUNCTION app.touch_row();
COMMIT;
