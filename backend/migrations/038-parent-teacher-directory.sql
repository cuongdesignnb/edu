BEGIN;
-- Only current own-child assignments and explicitly shared work contacts.
CREATE FUNCTION app.parent_teacher_directory(s uuid,st uuid,yr uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; ref date; hours text; class_label text;
BEGIN
 IF NOT app.parent_can_read(s,st,yr,'teachers') THEN RETURN NULL; END IF;
 SELECT (now() AT TIME ZONE sc.timezone)::date,NULLIF(sc.settings->>'contactHours','')
 INTO ref,hours FROM platform.schools sc WHERE sc.id=s;
 SELECT c.name INTO class_label FROM app.enrollments e
 JOIN app.classes c ON c.school_id=e.school_id AND c.id=e.class_id
 JOIN app.academic_years y ON y.school_id=e.school_id AND y.id=e.year_id
 WHERE e.school_id=s AND e.student_id=st AND e.year_id=yr AND e.status<>'CANCELLED'
   AND e.starts_on<=ref AND (e.ends_on IS NULL OR e.ends_on>ref)
   AND y.starts_on<=ref AND y.ends_on>ref ORDER BY e.starts_on DESC,e.id LIMIT 1;
 SELECT jsonb_agg(q.item ORDER BY q.kind,q.subject_name,q.work_display_name,q.assignment_id) INTO result
 FROM (SELECT a.id AS assignment_id,a.kind,su.name AS subject_name,m.work_display_name,
   jsonb_build_object('kind',a.kind,'displayName',m.work_display_name,'subjectName',su.name,
     'workEmail',CASE WHEN m.share_work_contact AND coalesce(sc.settings->>'shareTeacherEmail','true')='true' THEN NULLIF(m.work_email,'') END,
     'workPhone',CASE WHEN m.share_work_contact AND coalesce(sc.settings->>'shareTeacherPhone','true')='true' THEN NULLIF(m.work_phone,'') END,
     'weekdays',coalesce((SELECT jsonb_agg(days.weekday ORDER BY days.weekday) FROM (
       SELECT DISTINCT extract(isodow FROM lo.starts_at AT TIME ZONE sc.timezone)::integer AS weekday
       FROM app.lesson_occurrences lo
       JOIN app.publication_revisions pub ON pub.school_id=lo.school_id AND pub.class_id=lo.class_id
         AND pub.year_id=yr AND pub.kind='TIMETABLE' AND pub.status='PUBLISHED'
       WHERE lo.school_id=s AND lo.class_id=a.class_id AND lo.member_id=a.member_id AND lo.subject_id=a.subject_id
         AND lo.status='SCHEDULED' AND (lo.starts_at AT TIME ZONE sc.timezone)::date>=ref
         AND (lo.starts_at AT TIME ZONE sc.timezone)::date>=a.starts_on
         AND (a.ends_on IS NULL OR (lo.starts_at AT TIME ZONE sc.timezone)::date<a.ends_on)
         AND (lo.starts_at AT TIME ZONE sc.timezone)::date>=e.starts_on
         AND (e.ends_on IS NULL OR (lo.starts_at AT TIME ZONE sc.timezone)::date<e.ends_on)
         AND (lo.starts_at AT TIME ZONE sc.timezone)::date>=y.starts_on AND (lo.starts_at AT TIME ZONE sc.timezone)::date<y.ends_on
         AND lo.starts_at>=g.valid_from AND (g.valid_until IS NULL OR lo.starts_at<g.valid_until)
         AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(pub.staff_snapshot->'lessons','[]'::jsonb)) lesson WHERE lesson->>'id'=lo.id::text)
     ) days),'[]'::jsonb)) AS item
   FROM app.enrollments e
   JOIN platform.schools sc ON sc.id=e.school_id
   JOIN app.academic_years y ON y.school_id=e.school_id AND y.id=e.year_id AND y.starts_on<=ref AND y.ends_on>ref
   JOIN app.teaching_assignments a ON a.school_id=e.school_id AND a.class_id=e.class_id AND a.year_id=e.year_id
   JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL
   JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
   JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.member_id=m.id
     AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
     AND (g.scope_type='SCHOOL' OR g.class_id=a.class_id AND (g.scope_type='CLASS' OR g.scope_type='SUBJECT' AND g.subject_id=a.subject_id))
   JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
   LEFT JOIN app.subjects su ON su.school_id=a.school_id AND su.id=a.subject_id
   WHERE e.school_id=s AND e.student_id=st AND e.year_id=yr AND e.status<>'CANCELLED'
     AND e.starts_on<=ref AND (e.ends_on IS NULL OR e.ends_on>ref)
     AND a.revoked_at IS NULL AND a.starts_on<=ref AND (a.ends_on IS NULL OR a.ends_on>ref)
   ORDER BY a.kind,su.name,m.work_display_name,a.id LIMIT 1001) q;
 RETURN jsonb_build_object('today',ref,'classLabel',class_label,'contactHours',hours,'teachers',coalesce(result,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION app.parent_teacher_directory(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_teacher_directory(uuid,uuid,uuid) TO edu_parent,edu_app,edu_worker;
COMMIT;
