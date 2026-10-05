BEGIN;
INSERT INTO app.roles(school_id,code,label,system_role,status)
 SELECT id,'TEACHER','Giáo viên','true','ACTIVE' FROM platform.schools
 ON CONFLICT(school_id,code) DO NOTHING;
INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes)
 SELECT school_id,id,action,ARRAY['SCHOOL']::text[] FROM app.roles
 CROSS JOIN unnest(ARRAY['teacher.self','school.read','year.read']) action WHERE code='TEACHER' AND system_role
 ON CONFLICT(school_id,role_id,action_code) DO NOTHING;
INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes)
 SELECT school_id,id,'member.create_direct',ARRAY['SCHOOL']::text[] FROM app.roles WHERE code='SCHOOL_ADMIN' AND system_role
 ON CONFLICT(school_id,role_id,action_code) DO NOTHING;
COMMIT;
