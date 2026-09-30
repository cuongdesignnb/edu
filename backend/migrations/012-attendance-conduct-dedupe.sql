BEGIN;
CREATE UNIQUE INDEX conduct_one_attendance_fact ON app.conduct_records(school_id,enrollment_id,source_id) WHERE source_kind='ATTENDANCE' AND status<>'EXCLUDED';
COMMIT;
