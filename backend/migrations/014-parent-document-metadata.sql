BEGIN;
CREATE FUNCTION app.parent_document_metadata(s uuid,doc uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('contentType',f.content_type,'byteSize',f.byte_size)
 FROM app.parent_document_items d JOIN app.files f ON f.school_id=d.school_id AND f.id=d.file_id
 WHERE d.school_id=s AND d.id=doc AND d.revoked_at IS NULL AND d.published_at<=now()
 AND f.status='READY' AND (f.expires_at IS NULL OR f.expires_at>now())
 AND app.parent_can_read(d.school_id,d.student_id,d.year_id,'documents')
 AND (d.publication_id IS NULL OR app.parent_item_visible(d.school_id,d.student_id,d.year_id,'documents',d.publication_id))
$$;
REVOKE ALL ON FUNCTION app.parent_document_metadata(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parent_document_metadata(uuid,uuid) TO edu_parent,edu_app,edu_worker;
COMMIT;
