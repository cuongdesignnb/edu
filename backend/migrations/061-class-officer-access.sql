BEGIN;
ALTER TABLE app.class_positions ADD COLUMN description text NOT NULL DEFAULT '',
 ADD COLUMN weekly_bonus numeric(10,2) NOT NULL DEFAULT 0 CHECK(weekly_bonus>=0),
 ADD COLUMN officer_role text CHECK(officer_role IN ('GROUP_LEADER','CLASS_LEADER','LABOR_VICE'));
CREATE TABLE app.class_officer_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,class_id uuid NOT NULL,year_id uuid NOT NULL,
 enrollment_id uuid NOT NULL,group_id uuid,position_assignment_id uuid,
 role text NOT NULL CHECK(role IN ('GROUP_LEADER','CLASS_LEADER','LABOR_VICE')),
 valid_from date NOT NULL,valid_until date,revoked_at timestamptz,created_by uuid NOT NULL REFERENCES identity.users(id),
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),FOREIGN KEY(school_id,class_id,year_id) REFERENCES app.classes(school_id,id,year_id),
 FOREIGN KEY(school_id,enrollment_id) REFERENCES app.enrollments(school_id,id),
 FOREIGN KEY(school_id,group_id) REFERENCES app.class_groups(school_id,id),
 FOREIGN KEY(school_id,position_assignment_id) REFERENCES app.position_assignments(school_id,id),
 CHECK(valid_until IS NULL OR valid_until>valid_from),CHECK((role='GROUP_LEADER')=(group_id IS NOT NULL)));
CREATE UNIQUE INDEX uq_officer_active ON app.class_officer_assignments(school_id,class_id,role,enrollment_id) WHERE revoked_at IS NULL;
CREATE TABLE identity.class_officer_credentials(
 school_id uuid NOT NULL,assignment_id uuid PRIMARY KEY,pin_hash text NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0,locked_until timestamptz,rotated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,assignment_id) REFERENCES app.class_officer_assignments(school_id,id));
CREATE TABLE identity.class_officer_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,assignment_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE,csrf_hash text NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(school_id,assignment_id) REFERENCES app.class_officer_assignments(school_id,id));
ALTER TABLE app.conduct_records ADD COLUMN officer_assignment_id uuid,
 ADD CONSTRAINT conduct_officer_fk FOREIGN KEY(school_id,officer_assignment_id) REFERENCES app.class_officer_assignments(school_id,id);
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['app.class_officer_assignments','identity.class_officer_credentials','identity.class_officer_sessions'] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',target);
  EXECUTE format('CREATE POLICY tenant_isolation ON %s TO edu_app,edu_worker,edu_migrator USING(school_id=app.tenant_id()) WITH CHECK(school_id=app.tenant_id())',target);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %s TO edu_app',target);
  EXECUTE format('GRANT SELECT ON %s TO edu_worker',target);
 END LOOP;
END $$;
CREATE TRIGGER z_touch BEFORE UPDATE ON app.class_officer_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_row();
COMMIT;
