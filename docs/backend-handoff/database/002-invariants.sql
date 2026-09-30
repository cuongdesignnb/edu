-- Requires btree_gist installed by bootstrap/admin. Run after 001-schema.sql.

BEGIN;

CREATE FUNCTION app.tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('app.school_id', true), '')::uuid
$$;

CREATE FUNCTION app.touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Immutable identity' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_SCHEMA='app' THEN
   IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
     RAISE EXCEPTION 'Immutable tenant' USING ERRCODE='23514';
   END IF;
 END IF;
 NEW.version := OLD.version + 1;
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END $$;

CREATE TRIGGER z_touch BEFORE UPDATE ON identity.users FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON identity.staff_sessions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON identity.auth_challenges FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON identity.parent_sessions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON identity.rate_limit_buckets FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON identity.mail_outbox FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.schools FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.operator_grants FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.settings FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.support_tickets FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.support_access FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.operation_runs FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON platform.public_school_content FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.memberships FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.roles FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.role_permissions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.role_grants FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.staff_invitations FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.grade_levels FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.subjects FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.rooms FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.academic_years FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.terms FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.school_weeks FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.classes FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.calendar_events FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.teaching_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.students FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.enrollments FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.guardians FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.guardian_relationships FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.parent_access_links FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.transfer_requests FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.handover_requests FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.rollover_batches FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.class_groups FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.class_positions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.group_memberships FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.position_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.seating_plans FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.seat_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.rule_sets FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.conduct_rules FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.rule_thresholds FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.class_rule_periods FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.attendance_sessions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.attendance_records FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.conduct_periods FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.conduct_records FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.adjustment_requests FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.timetable_versions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.timetable_entries FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.lesson_occurrences FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.duty_schedules FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.duty_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.activities FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.activity_participants FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.files FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.evidence FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.announcements FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.announcement_targets FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.file_links FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.publication_revisions FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.parent_document_items FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.import_jobs FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.import_rows FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.export_jobs FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.notifications FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.outbox_events FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE TRIGGER z_touch BEFORE UPDATE ON app.idempotency_keys FOR EACH ROW EXECUTE FUNCTION app.touch_row();

CREATE INDEX ix_fk_001 ON identity.staff_sessions (user_id);

CREATE INDEX ix_fk_002 ON identity.auth_challenges (user_id);

CREATE INDEX ix_fk_003 ON identity.parent_sessions (school_id);

CREATE INDEX ix_fk_004 ON identity.parent_sessions (school_id,access_link_id);

CREATE INDEX ix_fk_005 ON identity.mail_outbox (user_id);

CREATE INDEX ix_fk_006 ON identity.mail_outbox (school_id);

CREATE INDEX ix_fk_007 ON platform.operator_grants (user_id);

CREATE INDEX ix_fk_008 ON platform.support_tickets (school_id);

CREATE INDEX ix_fk_009 ON platform.support_tickets (requester_id);

CREATE INDEX ix_fk_010 ON platform.support_tickets (assignee_id);

CREATE INDEX ix_fk_011 ON platform.support_messages (ticket_id);

CREATE INDEX ix_fk_012 ON platform.support_messages (author_id);

CREATE INDEX ix_fk_013 ON platform.support_access (school_id);

CREATE INDEX ix_fk_014 ON platform.support_access (ticket_id);

CREATE INDEX ix_fk_015 ON platform.support_access (operator_id);

CREATE INDEX ix_fk_016 ON platform.support_access (approved_by_user_id);

CREATE INDEX ix_fk_017 ON platform.support_access (school_id,class_id);

CREATE INDEX ix_fk_018 ON platform.audit_events (actor_id);

CREATE INDEX ix_fk_019 ON platform.audit_events (school_id);

CREATE INDEX ix_fk_023 ON app.memberships (user_id);

CREATE INDEX ix_fk_028 ON app.role_grants (school_id,member_id);

CREATE INDEX ix_fk_029 ON app.role_grants (school_id,role_id);

CREATE INDEX ix_fk_030 ON app.role_grants (school_id,class_id);

CREATE INDEX ix_fk_031 ON app.role_grants (school_id,subject_id);

CREATE INDEX ix_fk_032 ON app.role_grants (granted_by);

CREATE INDEX ix_fk_034 ON app.staff_invitations (invited_by);

CREATE INDEX ix_fk_035 ON app.staff_invitations (accepted_user_id);

CREATE INDEX ix_fk_044 ON app.school_weeks (school_id,term_id,year_id);

CREATE INDEX ix_fk_047 ON app.classes (school_id,grade_level_id);

CREATE INDEX ix_fk_049 ON app.calendar_events (school_id,year_id);

CREATE INDEX ix_fk_050 ON app.calendar_events (school_id,class_id,year_id);

CREATE INDEX ix_fk_052 ON app.teaching_assignments (school_id,class_id);

CREATE INDEX ix_fk_053 ON app.teaching_assignments (school_id,member_id);

CREATE INDEX ix_fk_055 ON app.teaching_assignments (school_id,subject_id);

CREATE INDEX ix_fk_058 ON app.enrollments (school_id,student_id);

CREATE INDEX ix_fk_059 ON app.enrollments (school_id,class_id,year_id);

CREATE INDEX ix_fk_063 ON app.guardian_relationships (school_id,guardian_id);

CREATE INDEX ix_fk_064 ON app.guardian_relationships (verified_by);

CREATE INDEX ix_fk_066 ON app.parent_access_links (school_id,student_id);

CREATE INDEX ix_fk_067 ON app.parent_access_links (school_id,year_id);

CREATE INDEX ix_fk_068 ON app.parent_access_links (issued_by);

CREATE INDEX ix_fk_069 ON app.parent_access_links (school_id,relationship_id,student_id);

CREATE INDEX ix_fk_071 ON app.parent_access_events (school_id,access_link_id);

CREATE INDEX ix_fk_073 ON app.transfer_requests (school_id,student_id);

CREATE INDEX ix_fk_074 ON app.transfer_requests (school_id,from_enrollment_id);

CREATE INDEX ix_fk_075 ON app.transfer_requests (school_id,to_class_id);

CREATE INDEX ix_fk_076 ON app.transfer_requests (requested_by);

CREATE INDEX ix_fk_077 ON app.transfer_requests (decided_by);

CREATE INDEX ix_fk_079 ON app.handover_requests (school_id,class_id);

CREATE INDEX ix_fk_080 ON app.handover_requests (school_id,from_assignment_id);

CREATE INDEX ix_fk_081 ON app.handover_requests (school_id,to_member_id);

CREATE INDEX ix_fk_082 ON app.handover_requests (requested_by);

CREATE INDEX ix_fk_083 ON app.handover_requests (decided_by);

CREATE INDEX ix_fk_085 ON app.rollover_batches (school_id,source_year_id);

CREATE INDEX ix_fk_086 ON app.rollover_batches (school_id,target_year_id);

CREATE INDEX ix_fk_087 ON app.rollover_batches (requested_by);

CREATE INDEX ix_fk_093 ON app.group_memberships (school_id,group_id,class_id);

CREATE INDEX ix_fk_094 ON app.group_memberships (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_096 ON app.position_assignments (school_id,position_id,class_id);

CREATE INDEX ix_fk_097 ON app.position_assignments (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_100 ON app.seating_plans (created_by);

CREATE INDEX ix_fk_102 ON app.seat_assignments (school_id,plan_id,class_id);

CREATE INDEX ix_fk_103 ON app.seat_assignments (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_105 ON app.rule_sets (issued_by);

CREATE INDEX ix_fk_111 ON app.class_rule_periods (school_id,class_id);

CREATE INDEX ix_fk_112 ON app.class_rule_periods (school_id,rule_set_id);

CREATE INDEX ix_fk_114 ON app.attendance_sessions (school_id,class_id,year_id);

CREATE INDEX ix_fk_115 ON app.attendance_sessions (school_id,lesson_id);

CREATE INDEX ix_fk_116 ON app.attendance_sessions (created_by);

CREATE INDEX ix_fk_118 ON app.attendance_records (school_id,session_id,class_id);

CREATE INDEX ix_fk_119 ON app.attendance_records (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_120 ON app.attendance_records (recorded_by);

CREATE INDEX ix_fk_122 ON app.conduct_periods (school_id,class_id,year_id);

CREATE INDEX ix_fk_123 ON app.conduct_periods (school_id,week_id,year_id);

CREATE INDEX ix_fk_124 ON app.conduct_periods (school_id,rule_set_id);

CREATE INDEX ix_fk_125 ON app.conduct_periods (locked_by);

CREATE INDEX ix_fk_127 ON app.conduct_records (school_id,period_id,class_id);

CREATE INDEX ix_fk_128 ON app.conduct_records (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_129 ON app.conduct_records (school_id,period_id,rule_set_id);

CREATE INDEX ix_fk_130 ON app.conduct_records (school_id,rule_id,rule_set_id);

CREATE INDEX ix_fk_131 ON app.conduct_records (school_id,supersedes_id);

CREATE INDEX ix_fk_132 ON app.conduct_records (recorded_by);

CREATE INDEX ix_fk_133 ON app.conduct_records (approved_by);

CREATE INDEX ix_fk_135 ON app.adjustment_requests (school_id,period_id);

CREATE INDEX ix_fk_136 ON app.adjustment_requests (school_id,baseline_publication_id);

CREATE INDEX ix_fk_137 ON app.adjustment_requests (requested_by);

CREATE INDEX ix_fk_138 ON app.adjustment_requests (decided_by);

CREATE INDEX ix_fk_140 ON app.timetable_versions (school_id,class_id,year_id);

CREATE INDEX ix_fk_141 ON app.timetable_versions (created_by);

CREATE INDEX ix_fk_143 ON app.timetable_entries (school_id,timetable_id,class_id);

CREATE INDEX ix_fk_144 ON app.timetable_entries (school_id,subject_id);

CREATE INDEX ix_fk_145 ON app.timetable_entries (school_id,member_id);

CREATE INDEX ix_fk_146 ON app.timetable_entries (school_id,room_id);

CREATE INDEX ix_fk_148 ON app.lesson_occurrences (school_id,timetable_id,class_id);

CREATE INDEX ix_fk_149 ON app.lesson_occurrences (school_id,subject_id);

CREATE INDEX ix_fk_150 ON app.lesson_occurrences (school_id,member_id);

CREATE INDEX ix_fk_151 ON app.lesson_occurrences (school_id,room_id);

CREATE INDEX ix_fk_153 ON app.duty_schedules (school_id,class_id,year_id);

CREATE INDEX ix_fk_154 ON app.duty_schedules (created_by);

CREATE INDEX ix_fk_156 ON app.duty_assignments (school_id,schedule_id,class_id);

CREATE INDEX ix_fk_157 ON app.duty_assignments (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_159 ON app.activities (school_id,class_id,year_id);

CREATE INDEX ix_fk_160 ON app.activities (created_by);

CREATE INDEX ix_fk_162 ON app.activity_participants (school_id,activity_id,class_id);

CREATE INDEX ix_fk_163 ON app.activity_participants (school_id,enrollment_id,class_id);

CREATE INDEX ix_fk_164 ON app.activity_participants (reviewed_by);

CREATE INDEX ix_fk_166 ON app.files (uploaded_by);

CREATE INDEX ix_fk_168 ON app.evidence (school_id,participant_id);

CREATE INDEX ix_fk_169 ON app.evidence (school_id,file_id);

CREATE INDEX ix_fk_170 ON app.evidence (submitted_by);

CREATE INDEX ix_fk_171 ON app.evidence (reviewed_by);

CREATE INDEX ix_fk_173 ON app.announcements (school_id,year_id);

CREATE INDEX ix_fk_174 ON app.announcements (school_id,class_id,year_id);

CREATE INDEX ix_fk_175 ON app.announcements (created_by);

CREATE INDEX ix_fk_177 ON app.announcement_targets (school_id,announcement_id);

CREATE INDEX ix_fk_178 ON app.announcement_targets (school_id,grade_id);

CREATE INDEX ix_fk_179 ON app.announcement_targets (school_id,class_id);

CREATE INDEX ix_fk_180 ON app.announcement_targets (school_id,student_id);

CREATE INDEX ix_fk_181 ON app.announcement_targets (school_id,member_id);

CREATE INDEX ix_fk_183 ON app.file_links (school_id,file_id);

CREATE INDEX ix_fk_184 ON app.file_links (school_id,student_id);

CREATE INDEX ix_fk_185 ON app.file_links (school_id,class_id);

CREATE INDEX ix_fk_186 ON app.file_links (school_id,activity_id);

CREATE INDEX ix_fk_187 ON app.file_links (school_id,announcement_id);

CREATE INDEX ix_fk_189 ON app.publication_revisions (school_id,conduct_period_id);

CREATE INDEX ix_fk_190 ON app.publication_revisions (school_id,attendance_session_id);

CREATE INDEX ix_fk_191 ON app.publication_revisions (school_id,timetable_id);

CREATE INDEX ix_fk_192 ON app.publication_revisions (school_id,duty_schedule_id);

CREATE INDEX ix_fk_193 ON app.publication_revisions (school_id,activity_id);

CREATE INDEX ix_fk_194 ON app.publication_revisions (school_id,announcement_id);

CREATE INDEX ix_fk_195 ON app.publication_revisions (school_id,class_id);

CREATE INDEX ix_fk_196 ON app.publication_revisions (school_id,year_id);

CREATE INDEX ix_fk_197 ON app.publication_revisions (created_by);

CREATE INDEX ix_fk_198 ON app.publication_revisions (published_by);

CREATE INDEX ix_fk_200 ON app.parent_publication_items (school_id,publication_id,year_id);

CREATE INDEX ix_fk_201 ON app.parent_publication_items (school_id,student_id);

CREATE INDEX ix_fk_203 ON app.parent_document_items (school_id,student_id);

CREATE INDEX ix_fk_204 ON app.parent_document_items (school_id,year_id);

CREATE INDEX ix_fk_205 ON app.parent_document_items (school_id,file_id);

CREATE INDEX ix_fk_206 ON app.parent_document_items (school_id,publication_id);

CREATE INDEX ix_fk_208 ON app.import_jobs (school_id,file_id);

CREATE INDEX ix_fk_209 ON app.import_jobs (requested_by);

CREATE INDEX ix_fk_213 ON app.export_jobs (requested_by);

CREATE INDEX ix_fk_214 ON app.export_jobs (school_id,class_id);

CREATE INDEX ix_fk_215 ON app.export_jobs (school_id,file_id);

CREATE INDEX ix_fk_217 ON app.notifications (school_id,member_id);

CREATE INDEX ix_fk_219 ON app.audit_events (actor_user_id);

CREATE INDEX ix_fk_222 ON app.idempotency_keys (actor_user_id);

CREATE INDEX ix_students_name ON app.students(school_id, lower(full_name), id);

CREATE INDEX ix_member_user ON app.memberships(user_id, status, school_id);

CREATE INDEX ix_sessions_expiry ON identity.staff_sessions(absolute_expires_at);

CREATE INDEX ix_parent_sessions_expiry ON identity.parent_sessions(absolute_expires_at);

CREATE INDEX ix_challenge_expiry ON identity.auth_challenges(expires_at);

CREATE INDEX ix_rate_limit_expiry ON identity.rate_limit_buckets(expires_at);

CREATE INDEX ix_outbox_due ON app.outbox_events(school_id, run_after, id) WHERE status IN ('PENDING','LEASED');

CREATE INDEX ix_mail_due ON identity.mail_outbox(run_after,id) WHERE status IN ('PENDING','LEASED');

CREATE INDEX ix_audit_time ON app.audit_events(school_id,created_at DESC,id);

CREATE INDEX ix_access_events_time ON app.parent_access_events(school_id,access_link_id,created_at DESC);

CREATE INDEX ix_parent_projection ON app.parent_publication_items(school_id,student_id,year_id,section,created_at DESC);

CREATE INDEX ix_conduct_review ON app.conduct_records(school_id,period_id,status,id);

CREATE INDEX ix_conduct_source ON app.conduct_records(school_id,source_kind,source_key);

CREATE UNIQUE INDEX uq_conduct_source_active ON app.conduct_records(school_id,enrollment_id,source_kind,source_key,rule_id) WHERE status <> 'EXCLUDED';

CREATE UNIQUE INDEX uq_active_seating ON app.seating_plans(school_id,class_id) WHERE status='ACTIVE';

CREATE UNIQUE INDEX uq_invitation_pending ON app.staff_invitations(school_id,email_normalized) WHERE status='PENDING';

CREATE INDEX ix_idempotency_expiry ON app.idempotency_keys(school_id,expires_at);

CREATE INDEX ix_export_expiry ON app.export_jobs(school_id,expires_at);

CREATE INDEX ix_notifications_unread ON app.notifications(school_id,member_id,created_at DESC) WHERE read_at IS NULL;

CREATE UNIQUE INDEX uq_pub_current_0 ON app.publication_revisions(school_id,conduct_period_id) WHERE status='PUBLISHED' AND conduct_period_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_rev_0 ON app.publication_revisions(school_id,conduct_period_id,revision) WHERE conduct_period_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_current_1 ON app.publication_revisions(school_id,attendance_session_id) WHERE status='PUBLISHED' AND attendance_session_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_rev_1 ON app.publication_revisions(school_id,attendance_session_id,revision) WHERE attendance_session_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_current_2 ON app.publication_revisions(school_id,timetable_id) WHERE status='PUBLISHED' AND timetable_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_rev_2 ON app.publication_revisions(school_id,timetable_id,revision) WHERE timetable_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_current_3 ON app.publication_revisions(school_id,duty_schedule_id) WHERE status='PUBLISHED' AND duty_schedule_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_rev_3 ON app.publication_revisions(school_id,duty_schedule_id,revision) WHERE duty_schedule_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_current_4 ON app.publication_revisions(school_id,activity_id) WHERE status='PUBLISHED' AND activity_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_rev_4 ON app.publication_revisions(school_id,activity_id,revision) WHERE activity_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_current_5 ON app.publication_revisions(school_id,announcement_id) WHERE status='PUBLISHED' AND announcement_id IS NOT NULL;

CREATE UNIQUE INDEX uq_pub_rev_5 ON app.publication_revisions(school_id,announcement_id,revision) WHERE announcement_id IS NOT NULL;

ALTER TABLE app.enrollments ADD CONSTRAINT no_enrollment_overlap EXCLUDE USING gist (school_id WITH =,student_id WITH =,year_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&) WHERE (status <> 'CANCELLED');

ALTER TABLE app.terms ADD CONSTRAINT no_term_overlap EXCLUDE USING gist (school_id WITH =,year_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&);

ALTER TABLE app.school_weeks ADD CONSTRAINT no_week_overlap EXCLUDE USING gist (school_id WITH =,year_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&);

ALTER TABLE app.teaching_assignments ADD CONSTRAINT no_homeroom_overlap EXCLUDE USING gist (school_id WITH =,class_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&) WHERE (kind='HOMEROOM' AND revoked_at IS NULL);

ALTER TABLE app.class_rule_periods ADD CONSTRAINT no_class_rule_overlap EXCLUDE USING gist (school_id WITH =,class_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&);

ALTER TABLE app.group_memberships ADD CONSTRAINT no_group_overlap EXCLUDE USING gist (school_id WITH =,enrollment_id WITH =,daterange(starts_on,ends_on,'[)') WITH &&);

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT no_lesson_overlap_class_id EXCLUDE USING gist (school_id WITH =,class_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status='SCHEDULED');

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT no_lesson_overlap_member_id EXCLUDE USING gist (school_id WITH =,member_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status='SCHEDULED');

ALTER TABLE app.lesson_occurrences ADD CONSTRAINT no_lesson_overlap_room_id EXCLUDE USING gist (school_id WITH =,room_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status='SCHEDULED');

CREATE FUNCTION app.guard_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g app.role_grants;
BEGIN
 SELECT * INTO g FROM app.role_grants WHERE school_id=NEW.school_id AND id=NEW.role_grant_id;
 IF NOT FOUND OR g.member_id<>NEW.member_id OR g.class_id IS DISTINCT FROM NEW.class_id
   OR g.subject_id IS DISTINCT FROM NEW.subject_id
   OR (NEW.kind='HOMEROOM' AND g.scope_type<>'CLASS')
   OR (NEW.kind='SUBJECT' AND g.scope_type<>'SUBJECT') THEN
   RAISE EXCEPTION 'Assignment/grant mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_assignment BEFORE INSERT OR UPDATE ON app.teaching_assignments
FOR EACH ROW EXECUTE FUNCTION app.guard_assignment();

CREATE FUNCTION app.guard_enrollment_dates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE y app.academic_years;
BEGIN
 SELECT * INTO y FROM app.academic_years WHERE school_id=NEW.school_id AND id=NEW.year_id;
 IF NOT FOUND OR NEW.starts_on < y.starts_on OR NEW.starts_on >= y.ends_on
 OR (NEW.ends_on IS NOT NULL AND NEW.ends_on > y.ends_on) THEN
 RAISE EXCEPTION 'Enrollment dates outside year' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_enrollment_dates BEFORE INSERT OR UPDATE ON app.enrollments
FOR EACH ROW EXECUTE FUNCTION app.guard_enrollment_dates();

CREATE FUNCTION app.guard_calendar_dates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lo date; hi date;
BEGIN
 IF TG_TABLE_NAME='school_weeks' THEN
  SELECT starts_on,ends_on INTO lo,hi FROM app.terms WHERE school_id=NEW.school_id AND id=NEW.term_id;
 ELSE
  SELECT starts_on,ends_on INTO lo,hi FROM app.academic_years WHERE school_id=NEW.school_id AND id=NEW.year_id;
 END IF;
 IF lo IS NULL OR NEW.starts_on<lo OR NEW.ends_on>hi THEN
  RAISE EXCEPTION 'Calendar range outside parent' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_term_dates BEFORE INSERT OR UPDATE ON app.terms FOR EACH ROW EXECUTE FUNCTION app.guard_calendar_dates();
CREATE TRIGGER guard_week_dates BEFORE INSERT OR UPDATE ON app.school_weeks FOR EACH ROW EXECUTE FUNCTION app.guard_calendar_dates();

CREATE FUNCTION app.guard_issued_rule_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'DRAFT' AND
  (to_jsonb(NEW)-ARRAY['status','version','updated_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['status','version','updated_at']) THEN
  RAISE EXCEPTION 'Issued rules immutable: create new revision' USING ERRCODE='23514';
 END IF;
 IF OLD.status <> 'DRAFT' AND NEW.status='DRAFT' THEN
  RAISE EXCEPTION 'Cannot revert issued rules' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_issued_rule_set BEFORE UPDATE ON app.rule_sets FOR EACH ROW EXECUTE FUNCTION app.guard_issued_rule_set();

CREATE FUNCTION app.guard_rule_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_state text; new_state text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
 SELECT status INTO old_state FROM app.rule_sets WHERE school_id=OLD.school_id AND id=OLD.rule_set_id;
 IF old_state IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Issued rule item immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
 SELECT status INTO new_state FROM app.rule_sets WHERE school_id=NEW.school_id AND id=NEW.rule_set_id;
 IF new_state IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Issued rule item immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_rule_item BEFORE INSERT OR UPDATE OR DELETE ON app.conduct_rules FOR EACH ROW EXECUTE FUNCTION app.guard_rule_item();
CREATE TRIGGER guard_threshold BEFORE INSERT OR UPDATE OR DELETE ON app.rule_thresholds FOR EACH ROW EXECUTE FUNCTION app.guard_rule_item();

CREATE FUNCTION app.guard_publication_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','published_at','published_by','withdrawn_at','version','updated_at'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','published_at','published_by','withdrawn_at','version','updated_at']) THEN
 RAISE EXCEPTION 'Publication content immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_publication_content BEFORE UPDATE ON app.publication_revisions FOR EACH ROW EXECUTE FUNCTION app.guard_publication_content();

CREATE FUNCTION app.deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Append-only object; use approved retention workflow' USING ERRCODE='23514';
END $$;

CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON app.parent_publication_items FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON platform.audit_events FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON app.parent_access_events FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();

COMMIT;
