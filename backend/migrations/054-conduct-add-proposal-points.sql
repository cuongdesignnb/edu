BEGIN;
-- The approved manual value must match the immutable proposal exactly.
CREATE OR REPLACE FUNCTION app.adjustment_add_allowed(rec app.conduct_records) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT rec.source_kind='MANUAL' AND rec.source_key ~ '^manual:[a-f0-9-]{36}$'
  AND rec.internal_note IS NULL AND rec.source_id IS NULL AND rec.subject_id IS NULL AND rec.lesson_id IS NULL
  AND EXISTS(SELECT 1 FROM app.adjustment_requests a
   CROSS JOIN LATERAL jsonb_array_elements(a.proposed_changes) change
   WHERE a.school_id=rec.school_id AND a.period_id=rec.period_id AND a.status='APPROVED'
   AND a.id=NULLIF(current_setting('app.adjustment_id',true),'')::uuid
   AND change->>'action'='ADD'
   AND change->'replacement'->>'clientEventId'=substring(rec.source_key from 8)
   AND change->'replacement'->>'periodId'=rec.period_id::text
   AND change->'replacement'->>'enrollmentId'=rec.enrollment_id::text
   AND change->'replacement'->>'ruleId'=rec.rule_id::text
   AND (change->'replacement'->>'occurredAt')::timestamptz=rec.occurred_at
   AND change->'replacement'->>'publicReason'=rec.public_reason
   AND (NOT (change->'replacement' ? 'manualDelta') OR (change->'replacement'->>'manualDelta')::numeric=rec.delta_snapshot)
   AND rec.recorded_by=a.requested_by
   AND rec.approved_by=NULLIF(current_setting('app.authenticated_user_id',true),'')::uuid
   AND app.adjustment_mutation_allowed(rec.school_id,rec.period_id,(change->'replacement'->>'clientEventId')::uuid,'ADD'))
$$;
REVOKE ALL ON FUNCTION app.adjustment_add_allowed(app.conduct_records) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adjustment_add_allowed(app.conduct_records) TO edu_app,edu_worker;
COMMIT;
