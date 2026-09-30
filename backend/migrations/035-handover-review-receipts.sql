BEGIN;

ALTER TABLE app.handover_requests ADD COLUMN source_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.handover_requests ADD COLUMN applied_assignment_id uuid;
ALTER TABLE app.handover_requests ADD COLUMN applied_at timestamptz;
ALTER TABLE app.handover_requests ADD COLUMN client_request_id uuid;
ALTER TABLE app.handover_requests ADD COLUMN intent_hash text;
CREATE UNIQUE INDEX handover_client_request_actor_idx ON app.handover_requests(school_id,requested_by,client_request_id) WHERE client_request_id IS NOT NULL;
ALTER TABLE app.handover_requests ADD CONSTRAINT handover_applied_assignment_school_fk
  FOREIGN KEY(school_id,applied_assignment_id) REFERENCES app.teaching_assignments(school_id,id) ON DELETE RESTRICT;

-- Only recover actual recorded approval evidence; unknown historic metadata stays null.
DO $$
DECLARE school_row record;previous_school text:=current_setting('app.school_id',true);
BEGIN
  FOR school_row IN SELECT id FROM platform.schools LOOP
    PERFORM set_config('app.school_id',school_row.id::text,true);
    UPDATE app.handover_requests h SET applied_assignment_id=a.id,applied_at=e.created_at
    FROM app.audit_events e JOIN app.teaching_assignments a ON a.school_id=e.school_id AND a.id::text=e.redacted_after->>'assignmentId'
    WHERE h.school_id=e.school_id AND h.id=e.target_id AND h.status='APPLIED'
      AND e.target_type='handover' AND e.action='approveHandover' AND a.kind='HOMEROOM'
      AND a.class_id=h.class_id AND a.member_id=h.to_member_id AND a.starts_on=h.effective_on;
  END LOOP;
  PERFORM set_config('app.school_id',coalesce(previous_school,''),true);
END $$;

COMMIT;
