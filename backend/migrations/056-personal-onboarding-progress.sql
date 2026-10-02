BEGIN;
CREATE TABLE identity.onboarding_progress (
 user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
 school_id uuid REFERENCES platform.schools(id) ON DELETE CASCADE,
 scope_key text NOT NULL,
 tour_key text NOT NULL CHECK (tour_key IN ('platform-overview','school-overview','teacher-overview','class-homeroom','class-subject','class-staff')),
 tour_version integer NOT NULL CHECK (tour_version=1),
 status text NOT NULL CHECK (status IN ('skipped','completed')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,scope_key,tour_key,tour_version),
 CHECK ((school_id IS NULL AND scope_key='PLATFORM' AND tour_key='platform-overview') OR
        (school_id IS NOT NULL AND scope_key='SCHOOL:'||school_id::text AND tour_key<>'platform-overview'))
);
ALTER TABLE identity.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.onboarding_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_owner ON identity.onboarding_progress TO edu_app
 USING (user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid)
 WITH CHECK (user_id=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON identity.onboarding_progress TO edu_app;
REVOKE ALL ON identity.onboarding_progress FROM PUBLIC,edu_parent,edu_worker;
COMMIT;
