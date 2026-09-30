-- Requires roles edu_app, edu_worker, edu_parent, edu_migrator from deploy/init-db.sh.

BEGIN;

ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.memberships TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.roles TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.role_permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.role_permissions TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.role_grants ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.role_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.role_grants TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.staff_invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.staff_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.staff_invitations TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.grade_levels ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.grade_levels FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.grade_levels TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.subjects ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.subjects FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.subjects TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.rooms FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.rooms TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.academic_years ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.academic_years FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.academic_years TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.terms ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.terms FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.terms TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.school_weeks ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.school_weeks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.school_weeks TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.classes ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.classes FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.classes TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.calendar_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.calendar_events TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.teaching_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.teaching_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.teaching_assignments TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.students ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.students FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.students TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.enrollments ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.enrollments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.enrollments TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.guardians ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.guardians FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.guardians TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.guardian_relationships ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.guardian_relationships FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.guardian_relationships TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.parent_access_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.parent_access_links FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.parent_access_links TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.parent_access_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.parent_access_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.parent_access_events TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.transfer_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.transfer_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.transfer_requests TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.handover_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.handover_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.handover_requests TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.rollover_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.rollover_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.rollover_batches TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.class_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.class_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.class_groups TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.class_positions ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.class_positions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.class_positions TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.group_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.group_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.group_memberships TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.position_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.position_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.position_assignments TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.seating_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.seating_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.seating_plans TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.seat_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.seat_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.seat_assignments TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.rule_sets ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.rule_sets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.rule_sets TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.conduct_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.conduct_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.conduct_rules TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.rule_thresholds ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.rule_thresholds FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.rule_thresholds TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.class_rule_periods ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.class_rule_periods FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.class_rule_periods TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.attendance_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.attendance_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.attendance_sessions TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.attendance_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.attendance_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.attendance_records TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.conduct_periods ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.conduct_periods FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.conduct_periods TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.conduct_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.conduct_records FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.conduct_records TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.adjustment_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.adjustment_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.adjustment_requests TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.timetable_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.timetable_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.timetable_versions TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.timetable_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.timetable_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.timetable_entries TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.lesson_occurrences ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.lesson_occurrences FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.lesson_occurrences TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.duty_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.duty_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.duty_schedules TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.duty_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.duty_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.duty_assignments TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.activities FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.activities TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.activity_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.activity_participants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.activity_participants TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.files ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.files FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.files TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.evidence ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.evidence TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.announcements ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.announcements FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.announcements TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.announcement_targets ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.announcement_targets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.announcement_targets TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.file_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.file_links FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.file_links TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.publication_revisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.publication_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.publication_revisions TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.parent_publication_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.parent_publication_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.parent_publication_items TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.parent_document_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.parent_document_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.parent_document_items TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.import_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.import_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.import_jobs TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.import_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.import_rows FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.import_rows TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.export_jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.export_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.export_jobs TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.notifications TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.audit_events TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.outbox_events TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

ALTER TABLE app.idempotency_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.idempotency_keys TO edu_app, edu_worker, edu_migrator
USING (school_id=app.tenant_id()) WITH CHECK (school_id=app.tenant_id());

CREATE FUNCTION app.parent_can_read(s uuid, st uuid, yr uuid, section_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s=app.tenant_id() AND EXISTS (
  SELECT 1 FROM identity.parent_sessions ps
  JOIN app.parent_access_links l ON l.school_id=ps.school_id AND l.id=ps.access_link_id
  JOIN app.guardian_relationships g ON g.school_id=l.school_id AND g.id=l.relationship_id AND g.student_id=l.student_id
  JOIN platform.schools sc ON sc.id=l.school_id
  WHERE ps.id=NULLIF(current_setting('app.parent_session_id',true),'')::uuid
    AND ps.school_id=s AND ps.revoked_at IS NULL
    AND ps.idle_expires_at>now() AND ps.absolute_expires_at>now()
    AND l.student_id=st AND l.year_id=yr
    AND l.revoked_at IS NULL AND l.expires_at>now()
    AND section_name=ANY(l.allowed_sections)
    AND g.status='VERIFIED' AND g.can_receive_info AND g.revoked_at IS NULL
    AND sc.status='ACTIVE'
 )
$$;
REVOKE ALL ON FUNCTION app.parent_can_read(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_can_read(uuid,uuid,uuid,text) TO edu_parent,edu_app,edu_worker;

CREATE FUNCTION app.parent_item_visible(s uuid, st uuid, yr uuid, section_name text, pub uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.parent_can_read(s,st,yr,section_name) AND EXISTS (
 SELECT 1 FROM app.publication_revisions p
 WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.status='PUBLISHED'
 )
$$;
REVOKE ALL ON FUNCTION app.parent_item_visible(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_item_visible(uuid,uuid,uuid,text,uuid) TO edu_parent,edu_app,edu_worker;
CREATE POLICY parent_projection_read ON app.parent_publication_items FOR SELECT TO edu_parent
USING (app.parent_item_visible(school_id,student_id,year_id,section,publication_id));

CREATE POLICY parent_documents_read ON app.parent_document_items FOR SELECT TO edu_parent
USING (
 revoked_at IS NULL AND published_at <= now()
 AND app.parent_can_read(school_id,student_id,year_id,'documents')
 AND (publication_id IS NULL OR app.parent_item_visible(school_id,student_id,year_id,'documents',publication_id))
);

GRANT USAGE ON SCHEMA app TO edu_app,edu_worker,edu_parent;

GRANT USAGE ON SCHEMA identity,platform TO edu_app,edu_worker;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA app TO edu_app,edu_worker;

GRANT SELECT ON app.parent_publication_items,app.parent_document_items TO edu_parent;

GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity TO edu_app;

GRANT SELECT,INSERT,UPDATE,DELETE ON identity.mail_outbox,identity.rate_limit_buckets TO edu_worker;

GRANT SELECT ON identity.users TO edu_worker;

GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA platform TO edu_app;

GRANT SELECT ON platform.schools,platform.settings TO edu_worker;

GRANT SELECT,INSERT,UPDATE ON platform.operation_runs,platform.public_school_content TO edu_worker;

GRANT INSERT ON platform.audit_events TO edu_worker;

REVOKE UPDATE,DELETE ON app.audit_events,app.parent_access_events,app.parent_publication_items,platform.audit_events FROM edu_app,edu_worker;

REVOKE DELETE ON app.publication_revisions,app.rule_sets,app.conduct_records,app.enrollments FROM edu_app,edu_worker;

REVOKE ALL ON ALL TABLES IN SCHEMA app,identity,platform FROM PUBLIC;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

COMMIT;
