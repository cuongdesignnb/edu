BEGIN;
-- Minimal published metadata and history require the current own-child context.
CREATE FUNCTION app.parent_conduct_display(s uuid,st uuid,yr uuid,pub uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE display jsonb; zone text;
BEGIN
 IF NOT app.parent_can_read(s,st,yr,'conduct') OR NOT app.parent_item_visible(s,st,yr,'conduct',pub) THEN RETURN NULL; END IF;
 SELECT p.staff_snapshot->'conductDisplay',sc.timezone INTO display,zone FROM app.publication_revisions p
 JOIN app.parent_publication_items i ON i.school_id=p.school_id AND i.publication_id=p.id
 JOIN platform.schools sc ON sc.id=p.school_id
 WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.kind='CONDUCT' AND p.status='PUBLISHED'
   AND i.student_id=st AND i.year_id=yr AND i.section='conduct' AND i.payload->>'periodId'=p.conduct_period_id::text;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('weekNumber',display->'weekNumber','startsOn',display->>'startsOn','endsOn',display->>'endsOn',
   'classLabel',display->>'classLabel','ruleSetName',display->>'ruleSetName','ruleSetRevision',display->'ruleSetRevision',
   'minimumPoints',display->>'minimumPoints','maximumPoints',display->>'maximumPoints','timezone',coalesce(display->>'timezone',zone));
END $$;
REVOKE ALL ON FUNCTION app.parent_conduct_display(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_conduct_display(uuid,uuid,uuid,uuid) TO edu_parent,edu_app,edu_worker;

CREATE FUNCTION app.parent_conduct_history(s uuid,st uuid,yr uuid,pub uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE period uuid;
BEGIN
 IF app.parent_conduct_display(s,st,yr,pub) IS NULL THEN RETURN NULL; END IF;
 SELECT conduct_period_id INTO period FROM app.publication_revisions WHERE school_id=s AND id=pub AND year_id=yr AND kind='CONDUCT' AND status='PUBLISHED';
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN (SELECT coalesce(jsonb_agg(value ORDER BY revision),'[]'::jsonb) FROM (
   SELECT p.revision,jsonb_build_object('revision',i.payload->'revision','publishedAt',p.published_at,'total',i.payload->>'finalPoints','classification',i.payload->'classification','current',p.id=pub) AS value
   FROM app.publication_revisions p JOIN app.parent_publication_items i ON i.school_id=p.school_id AND i.publication_id=p.id
   WHERE p.school_id=s AND p.year_id=yr AND p.kind='CONDUCT' AND p.conduct_period_id=period
     AND p.status IN ('PUBLISHED','SUPERSEDED') AND p.published_at IS NOT NULL AND p.published_at<=now()
     AND i.student_id=st AND i.year_id=yr AND i.section='conduct' AND i.payload->>'periodId'=period::text
   ORDER BY p.revision LIMIT 1001
 ) history);
END $$;
REVOKE ALL ON FUNCTION app.parent_conduct_history(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_conduct_history(uuid,uuid,uuid,uuid) TO edu_parent,edu_app,edu_worker;
COMMIT;
