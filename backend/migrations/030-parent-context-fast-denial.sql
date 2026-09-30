BEGIN;
-- Keep the original session/link/guardian/publication checks. An absent or
-- mismatched transaction context must return before planning the private joins.
CREATE OR REPLACE FUNCTION app.parent_can_read(s uuid,st uuid,yr uuid,section_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF s IS NULL OR st IS NULL OR yr IS NULL OR section_name IS NULL
    OR s IS DISTINCT FROM app.tenant_id()
    OR NULLIF(current_setting('app.parent_session_id',true),'') IS NULL THEN
   RETURN false;
 END IF;
 RETURN EXISTS (
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
 );
END $$;
CREATE OR REPLACE FUNCTION app.parent_item_visible(s uuid,st uuid,yr uuid,section_name text,pub uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.parent_can_read(s,st,yr,section_name) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM app.publication_revisions p
   WHERE p.school_id=s AND p.id=pub AND p.year_id=yr AND p.status='PUBLISHED');
END $$;
REVOKE ALL ON FUNCTION app.parent_can_read(uuid,uuid,uuid,text),app.parent_item_visible(uuid,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_can_read(uuid,uuid,uuid,text),app.parent_item_visible(uuid,uuid,uuid,text,uuid) TO edu_parent,edu_app,edu_worker;
ALTER POLICY parent_projection_read ON app.parent_publication_items TO edu_parent USING (
 school_id=(SELECT app.tenant_id())
 AND NULLIF(current_setting('app.parent_session_id',true),'') IS NOT NULL
 AND app.parent_item_visible(school_id,student_id,year_id,section,publication_id)
);
ALTER POLICY parent_documents_read ON app.parent_document_items TO edu_parent USING (
 school_id=(SELECT app.tenant_id())
 AND NULLIF(current_setting('app.parent_session_id',true),'') IS NOT NULL
 AND revoked_at IS NULL AND published_at<=now()
 AND app.parent_can_read(school_id,student_id,year_id,'documents')
 AND (publication_id IS NULL OR app.parent_item_visible(school_id,student_id,year_id,'documents',publication_id))
);
COMMIT;
