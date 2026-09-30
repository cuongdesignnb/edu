BEGIN;
CREATE FUNCTION app.parent_publication_time(s uuid,st uuid,yr uuid,section_name text,pub uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.published_at FROM app.publication_revisions p WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.status='PUBLISHED'
 AND app.parent_item_visible(s,st,yr,section_name,pub)
$$;
REVOKE ALL ON FUNCTION app.parent_publication_time(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_publication_time(uuid,uuid,uuid,text,uuid) TO edu_parent,edu_app,edu_worker;
COMMIT;
