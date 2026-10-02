-- Staff explanations must be captured with the publication, not rebuilt from current records.
ALTER TABLE app.publication_revisions ADD COLUMN conduct_workspace_snapshot jsonb;
ALTER TABLE app.conduct_records ADD COLUMN review_decision text
 CHECK(review_decision IS NULL OR review_decision IN ('reject','void'));
ALTER TABLE app.conduct_records ADD COLUMN distinct_note text
 CHECK(distinct_note IS NULL OR length(btrim(distinct_note)) BETWEEN 5 AND 2000);
CREATE FUNCTION app.capture_conduct_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p app.conduct_periods; cfg jsonb; roster jsonb; events jsonb;
BEGIN
 IF NEW.kind<>'CONDUCT' THEN RETURN NEW; END IF;
 SELECT * INTO p FROM app.conduct_periods WHERE school_id=NEW.school_id AND id=NEW.conduct_period_id;
 SELECT jsonb_build_object('set',to_jsonb(r),'rules',coalesce((SELECT jsonb_agg(to_jsonb(cr) ORDER BY cr.code,cr.id) FROM app.conduct_rules cr WHERE cr.school_id=r.school_id AND cr.rule_set_id=r.id),'[]'::jsonb),
 'thresholds',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order,t.id) FROM app.rule_thresholds t WHERE t.school_id=r.school_id AND t.rule_set_id=r.id),'[]'::jsonb)) INTO cfg
 FROM app.rule_sets r WHERE r.school_id=p.school_id AND r.id=p.rule_set_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'student_id',e.student_id,'starts_on',e.starts_on,'full_name',s.full_name,'student_code',s.student_code) ORDER BY e.starts_on,e.id),'[]'::jsonb) INTO roster
 FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id JOIN app.school_weeks w ON w.school_id=e.school_id AND w.id=p.week_id
 WHERE e.school_id=p.school_id AND e.class_id=p.class_id AND e.status<>'CANCELLED' AND daterange(e.starts_on,e.ends_on,'[)')&&daterange(w.starts_on,w.ends_on,'[)');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'enrollment_id',r.enrollment_id,'delta_snapshot',r.delta_snapshot,'rule_label_snapshot',r.rule_label_snapshot,
 'date',(r.occurred_at AT TIME ZONE sc.timezone)::date,'share_with_parent_snapshot',r.share_with_parent_snapshot) ORDER BY r.occurred_at,r.id),'[]'::jsonb) INTO events
 FROM app.conduct_records r JOIN platform.schools sc ON sc.id=r.school_id WHERE r.school_id=p.school_id AND r.period_id=p.id AND r.status='APPROVED';
 NEW.conduct_workspace_snapshot:=jsonb_build_object('configuration',cfg,'enrollments',roster,'records',events);
 RETURN NEW;
END $$;
CREATE TRIGGER capture_conduct_workspace BEFORE INSERT ON app.publication_revisions FOR EACH ROW EXECUTE FUNCTION app.capture_conduct_workspace();
-- Existing guard_publication_content includes this new column in its immutable comparison.
