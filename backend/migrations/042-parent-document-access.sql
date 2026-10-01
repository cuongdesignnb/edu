BEGIN;
-- Metadata carries current, independent view/download rights, never storage IDs.
CREATE FUNCTION app.parent_document_access(s uuid,doc uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',d.id,'title',d.title,'contentType',f.content_type,
   'byteSize',f.byte_size,'publishedAt',d.published_at,
   'viewAllowed',f.content_type IN ('image/png','image/jpeg','image/webp','application/pdf'),
   'downloadAllowed',d.download_allowed AND l.allow_download)
 FROM app.parent_document_items d JOIN app.files f ON f.school_id=d.school_id AND f.id=d.file_id
 JOIN identity.parent_sessions ps ON ps.id=NULLIF(current_setting('app.parent_session_id',true),'')::uuid AND ps.school_id=d.school_id
 JOIN app.parent_access_links l ON l.school_id=ps.school_id AND l.id=ps.access_link_id
 WHERE d.school_id=s AND d.id=doc AND d.revoked_at IS NULL AND d.published_at<=now()
   AND f.status='READY' AND (f.expires_at IS NULL OR f.expires_at>now())
   AND app.parent_can_read(d.school_id,d.student_id,d.year_id,'documents')
   AND (d.publication_id IS NULL OR app.parent_item_visible(d.school_id,d.student_id,d.year_id,'documents',d.publication_id))
$$;
REVOKE ALL ON FUNCTION app.parent_document_access(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_document_access(uuid,uuid) TO edu_parent,edu_app,edu_worker;

-- Only the server pool may resolve private storage, under the same parent guard.
CREATE FUNCTION app.parent_document_file(s uuid,doc uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT info || jsonb_build_object('objectKey',f.object_key,'filename',f.original_name)
 FROM app.parent_document_items d JOIN app.files f ON f.school_id=d.school_id AND f.id=d.file_id
 CROSS JOIN LATERAL(SELECT app.parent_document_access(s,doc) AS info) meta
 WHERE d.school_id=s AND d.id=doc AND meta.info IS NOT NULL
$$;
REVOKE ALL ON FUNCTION app.parent_document_file(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_document_file(uuid,uuid) TO edu_app,edu_worker;
COMMIT;
