BEGIN;
ALTER TABLE app.activities ADD COLUMN starts_at timestamptz,
 ADD COLUMN max_files integer NOT NULL DEFAULT 5 CHECK(max_files BETWEEN 1 AND 20);
CREATE TABLE app.evidence_access(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,class_id uuid NOT NULL,participant_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,revoked_at timestamptz,issued_by uuid NOT NULL REFERENCES identity.users(id),
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),FOREIGN KEY(school_id,participant_id) REFERENCES app.activity_participants(school_id,id),
 FOREIGN KEY(school_id,class_id) REFERENCES app.classes(school_id,id));
CREATE TABLE identity.evidence_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,access_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE,csrf_hash text NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
 FOREIGN KEY(school_id,access_id) REFERENCES app.evidence_access(school_id,id));
ALTER TABLE app.evidence ADD COLUMN access_id uuid,
 ADD CONSTRAINT evidence_access_fk FOREIGN KEY(school_id,access_id) REFERENCES app.evidence_access(school_id,id);
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['app.evidence_access','identity.evidence_sessions'] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id())',target);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %s TO edu_app',target);
 END LOOP;
END $$;
CREATE TRIGGER z_touch BEFORE UPDATE ON app.evidence_access FOR EACH ROW EXECUTE FUNCTION app.touch_row();
COMMIT;
