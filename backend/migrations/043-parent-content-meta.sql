BEGIN;
-- Extract only display metadata from the immutable publication, never its
-- roster, staff notes, recipients, source IDs or raw file references.
CREATE FUNCTION app.parent_content_meta(s uuid,st uuid,yr uuid,section_name text,pub uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE snap jsonb; child jsonb; zone text;
BEGIN
 IF section_name NOT IN ('activities','announcements') OR NOT app.parent_can_read(s,st,yr,section_name)
    OR NOT app.parent_item_visible(s,st,yr,section_name,pub) THEN RETURN NULL; END IF;
 SELECT p.staff_snapshot,i.payload,sc.timezone INTO snap,child,zone FROM app.publication_revisions p
 JOIN app.parent_publication_items i ON i.school_id=p.school_id AND i.publication_id=p.id
 JOIN platform.schools sc ON sc.id=p.school_id
 WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.status='PUBLISHED'
   AND p.kind=CASE section_name WHEN 'activities' THEN 'ACTIVITY' ELSE 'ANNOUNCEMENT' END
   AND i.student_id=st AND i.year_id=yr AND i.section=section_name;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF section_name='activities' THEN
   RETURN jsonb_build_object('activityStatus',CASE WHEN snap->'activity'->>'status' IN ('ASSIGNED','CLOSED') THEN snap->'activity'->>'status' ELSE NULL END,
     'illustration',CASE WHEN snap->'activity'->>'illustration' IN ('trophy','stem','clean','book','heart') THEN snap->'activity'->>'illustration' ELSE NULL END,
     'updatedAt',snap->'activity'->>'updatedAt','timezone',zone,'dueOn',to_char((child->>'dueAt')::timestamptz AT TIME ZONE zone,'YYYY-MM-DD'));
 END IF;
 RETURN jsonb_build_object('summary',snap->'announcement'->>'summary','scopeKinds',coalesce((
   SELECT jsonb_agg(kind ORDER BY kind) FROM (SELECT DISTINCT target->>'kind' AS kind
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(snap->'announcement'->'targets')='array' THEN snap->'announcement'->'targets' ELSE '[]'::jsonb END) target
   WHERE target->>'kind' IN ('PUBLIC','SCHOOL','GRADE','CLASS','STUDENT')) kinds),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION app.parent_content_meta(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_content_meta(uuid,uuid,uuid,text,uuid) TO edu_parent,edu_app,edu_worker;
COMMIT;
