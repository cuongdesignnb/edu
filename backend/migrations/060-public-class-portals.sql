BEGIN;
CREATE TABLE platform.public_class_portals(
 school_id uuid NOT NULL REFERENCES platform.schools(id),class_id uuid NOT NULL,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-f0-9]{24}$'),version integer NOT NULL DEFAULT 1,
 enabled boolean NOT NULL DEFAULT false,settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES identity.users(id),
 PRIMARY KEY(school_id,class_id),FOREIGN KEY(school_id,class_id) REFERENCES app.classes(school_id,id));
GRANT SELECT,INSERT,UPDATE ON platform.public_class_portals TO edu_app;
GRANT SELECT ON platform.public_class_portals TO edu_worker;
COMMIT;
