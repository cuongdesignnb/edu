BEGIN;
ALTER TABLE platform.support_tickets DROP CONSTRAINT support_tickets_status_check;
ALTER TABLE platform.support_tickets ADD CONSTRAINT support_tickets_status_check CHECK(status IN ('OPEN','IN_PROGRESS','WAITING_SCHOOL','RESOLVED','CLOSED'));
ALTER TABLE platform.support_tickets DROP CONSTRAINT support_tickets_priority_check;
ALTER TABLE platform.support_tickets ADD CONSTRAINT support_tickets_priority_check CHECK(priority IN ('LOW','NORMAL','HIGH'));
ALTER TABLE platform.support_tickets ADD CONSTRAINT support_ticket_tenant_identity UNIQUE(school_id,id);
ALTER TABLE platform.support_messages ADD COLUMN side text NOT NULL DEFAULT 'UNKNOWN' CHECK(side IN ('SCHOOL','PLATFORM','UNKNOWN'));
ALTER TABLE platform.support_access
 ADD COLUMN requested_by_user_id uuid REFERENCES identity.users(id),
 ADD CONSTRAINT support_access_ticket_tenant FOREIGN KEY(school_id,ticket_id) REFERENCES platform.support_tickets(school_id,id),
 ADD CONSTRAINT support_access_read_actions CHECK(cardinality(allowed_actions)>0 AND allowed_actions<@ARRAY['school.read','year.read','dictionary.read','class.read','assignment.read','member.read','role.read','school.settings','import.read']::text[]),
 ADD CONSTRAINT support_access_class_actions CHECK(class_id IS NULL OR allowed_actions<@ARRAY['class.read','assignment.read']::text[]),
 ADD CONSTRAINT support_access_time_bound CHECK(valid_until-valid_from<=interval '14 days');
CREATE INDEX support_ticket_school_status ON platform.support_tickets(school_id,status,created_at,id);
CREATE INDEX support_message_ticket_date ON platform.support_messages(ticket_id,created_at,id);
CREATE INDEX support_access_operator_current ON platform.support_access(operator_id,school_id,status,valid_until);
CREATE FUNCTION platform.guard_support_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.requested_by_user_id IS NULL THEN
  RAISE EXCEPTION 'Support requester must be recorded' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.school_id,NEW.ticket_id,NEW.operator_id,NEW.class_id,NEW.allowed_actions,NEW.reason,NEW.valid_from,NEW.valid_until,NEW.requested_by_user_id)
  IS DISTINCT FROM (OLD.school_id,OLD.ticket_id,OLD.operator_id,OLD.class_id,OLD.allowed_actions,OLD.reason,OLD.valid_from,OLD.valid_until,OLD.requested_by_user_id) THEN
  RAISE EXCEPTION 'Support request scope is immutable; make a new request' USING ERRCODE='23514';
 END IF;
 IF NEW.status='APPROVED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF TG_OP='INSERT' OR OLD.status<>'REQUESTED' OR NEW.approved_by_user_id IS NULL OR NEW.approved_by_user_id=NEW.operator_id
   OR NEW.valid_until<=now() OR NEW.approved_by_user_id IS DISTINCT FROM NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
   OR NOT EXISTS(SELECT 1 FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
    JOIN app.role_grants g ON g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
    JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
    JOIN app.role_permissions p ON p.school_id=r.school_id AND p.role_id=r.id AND p.action_code='support.approve' AND 'SCHOOL'=ANY(p.allowed_scopes)
    WHERE m.school_id=NEW.school_id AND m.user_id=NEW.approved_by_user_id AND m.status='ACTIVE' AND m.ended_at IS NULL) THEN
   RAISE EXCEPTION 'Support consent requires a current independent school approver' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_support_request BEFORE INSERT OR UPDATE ON platform.support_access FOR EACH ROW EXECUTE FUNCTION platform.guard_support_access();
COMMIT;
