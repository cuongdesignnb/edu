BEGIN;
ALTER TABLE app.notifications ADD COLUMN class_id uuid,ADD COLUMN subject_id uuid,
 ADD COLUMN required_action text NOT NULL DEFAULT 'school.read',ADD COLUMN body text NOT NULL DEFAULT '',ADD COLUMN source_key text;
ALTER TABLE app.notifications ADD CONSTRAINT notification_class_fk FOREIGN KEY(school_id,class_id) REFERENCES app.classes(school_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT notification_subject_fk FOREIGN KEY(school_id,subject_id) REFERENCES app.subjects(school_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT notification_subject_class CHECK(subject_id IS NULL OR class_id IS NOT NULL),
 ADD CONSTRAINT notification_text_limits CHECK(char_length(title)<=200 AND char_length(body)<=2000 AND (source_key IS NULL OR char_length(source_key)<=512));
CREATE UNIQUE INDEX notification_source_once ON app.notifications(school_id,member_id,source_key) WHERE source_key IS NOT NULL;
CREATE INDEX notification_member_feed ON app.notifications(school_id,member_id,created_at DESC,id DESC);
COMMIT;
