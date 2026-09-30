import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { databaseConfig } from '../../common/config';
import { roleTemplates } from '../../common/contract';
import { hashPassword } from '../../common/security';

export function seedId(key: string) {
  const hex = crypto.createHash('sha256').update(`edumanage-new-local-fixtures-v1:${key}`).digest('hex').slice(0,32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
}
export async function seedLocal(password: string, forTest = false) {
  const config = databaseConfig('migrator');
  if ((!forTest && process.env.APP_ENV !== 'local') || (forTest && process.env.APP_ENV !== 'test')
    || !config.database?.endsWith('_local')) throw new Error('LOCAL_SEED_REFUSED');
  if (password.length < 12 || password.length > 256) throw new Error('Password must contain 12..256 characters');
  const pool = new Pool(config), tx = await pool.connect();
  const passwordHash = await hashPassword(password);
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT pg_advisory_xact_lock(18763,2)');
    const emails = ['operator','admin-a','admin-b','teacher-a','teacher-b','multi'];
    for (const name of emails) {
      const id = seedId(`user:${name}`), email = `${name}@example.invalid`;
      const existing = (await tx.query<{ id: string }>('SELECT id FROM identity.users WHERE email_normalized=$1', [email])).rows[0];
      if (existing && existing.id !== id) throw new Error('SEED_IDENTITY_NAMESPACE_CONFLICT');
      await tx.query(`INSERT INTO identity.users(id,email_normalized,display_name,password_hash,status,email_verified_at)
        VALUES($1,$2,$3,$4,'ACTIVE',now()) ON CONFLICT(id) DO NOTHING`, [id,email,
        name === 'teacher-a' ? 'Cô Lan (kiểm thử)' : name === 'teacher-b' ? 'Thầy Hùng (kiểm thử)' : `${name} (kiểm thử)`,passwordHash]);
    }
    for (const action of roleTemplates.find(role => role.code === 'PLATFORM_OPERATOR')!.actions) {
      await tx.query(`INSERT INTO platform.operator_grants(id,user_id,action_code) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,
        [seedId(`operator:${action}`),seedId('user:operator'),action]);
    }
    for (const key of ['A','B']) {
      const school = seedId(`school:${key}`), year = seedId(`year:${key}`);
      await tx.query(`INSERT INTO platform.schools(id,code,slug,name,status,public_contact_phone)
        VALUES($1,$2,$3,$4,'ACTIVE','Liên hệ quản trị kiểm thử') ON CONFLICT(id) DO NOTHING`,
        [school,`TEST-${key}`,`truong-thu-${key.toLowerCase()}`,`Trường thử ${key}`]);
      await tx.query("SELECT set_config('app.school_id',$1,true)",[school]);
      for (const role of roleTemplates.filter(role => role.scope !== 'PLATFORM')) {
        const roleId = seedId(`role:${key}:${role.code}`);
        await tx.query(`INSERT INTO app.roles(id,school_id,code,label,system_role)
          VALUES($1,$2,$3,$4,true) ON CONFLICT(id) DO NOTHING`, [roleId,school,role.code,role.label]);
        for (const action of role.actions) await tx.query(`INSERT INTO app.role_permissions(id,school_id,role_id,action_code,allowed_scopes)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`, [seedId(`permission:${key}:${role.code}:${action}`),school,roleId,action,[role.scope]]);
      }
      await tx.query(`INSERT INTO app.academic_years(id,school_id,code,name,starts_on,ends_on,status)
        VALUES($1,$2,'2026-2027','2026–2027','2026-09-01','2027-06-01','ACTIVE') ON CONFLICT(id) DO NOTHING`, [year,school]);
      await tx.query(`INSERT INTO app.terms(id,school_id,year_id,code,name,starts_on,ends_on)
        VALUES($1,$2,$3,'HK1','Học kỳ 1','2026-09-01','2027-01-11') ON CONFLICT(id) DO NOTHING`, [seedId(`term:${key}`),school,year]);
      // Whole-year school weeks are derived from the term dates, not a fixed 35.
      let starts = new Date('2026-09-01T00:00:00Z'), number = 1;
      while (starts < new Date('2027-01-11T00:00:00Z')) {
        const daysUntilMonday = ((8 - starts.getUTCDay()) % 7) || 7;
        const ends = new Date(Math.min(starts.getTime()+daysUntilMonday*86400000, Date.parse('2027-01-11T00:00:00Z')));
        await tx.query(`INSERT INTO app.school_weeks(id,school_id,year_id,term_id,week_number,starts_on,ends_on)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`, [seedId(`week:${key}:${number}`),school,year,
          seedId(`term:${key}`),number,starts.toISOString().slice(0,10),ends.toISOString().slice(0,10)]);
        starts=ends;number++;
      }
      await tx.query(`INSERT INTO app.grade_levels(id,school_id,code,name) VALUES($1,$2,'10','Khối 10') ON CONFLICT(id) DO NOTHING`, [seedId(`grade:${key}`),school]);
      await tx.query(`INSERT INTO app.subjects(id,school_id,code,name) VALUES($1,$2,'MATH','Toán') ON CONFLICT(id) DO NOTHING`, [seedId(`subject:${key}:math`),school]);
      const names = key === 'A' ? ['admin-a','teacher-a','teacher-b','multi'] : ['admin-b','multi'];
      for (const name of names) {
        const member = seedId(`member:${key}:${name}`), user = seedId(`user:${name}`);
        await tx.query(`INSERT INTO app.memberships(id,school_id,user_id,work_display_name,staff_code,status,joined_at,work_phone,share_work_contact)
          VALUES($1,$2,$3,$4,$5,'ACTIVE',now(),'Liên hệ công việc kiểm thử',true) ON CONFLICT(id) DO NOTHING`, [member,school,user,`${name} (kiểm thử)`,`TEST-${name}`]);
        if (name.startsWith('admin')) await tx.query(`INSERT INTO app.role_grants(id,school_id,member_id,role_id,scope_type,valid_from,granted_by)
          VALUES($1,$2,$3,$4,'SCHOOL','2026-09-01',$5) ON CONFLICT(id) DO NOTHING`, [seedId(`grant:${key}:${name}:admin`),school,member,
          seedId(`role:${key}:SCHOOL_ADMIN`),user]);
      }
      for (const classCode of key === 'A' ? ['10A1','10A2'] : ['10A1']) {
        const classId = seedId(`class:${key}:${classCode}`);
        await tx.query(`INSERT INTO app.classes(id,school_id,year_id,grade_level_id,code,name,capacity,status)
          VALUES($1,$2,$3,$4,$5,$5,40,'ACTIVE') ON CONFLICT(id) DO NOTHING`, [classId,school,year,seedId(`grade:${key}`),classCode]);
        for (let i=1;i<=6;i++) {
          const student=seedId(`student:${key}:${classCode}:${i}`), enrollment=seedId(`enrollment:${key}:${classCode}:${i}`);
          await tx.query(`INSERT INTO app.students(id,school_id,student_code,full_name,date_of_birth,internal_note)
            VALUES($1,$2,$3,$4,'2011-01-01','Ghi chú nội bộ kiểm thử, không dành cho phụ huynh') ON CONFLICT(id) DO NOTHING`,
          [student,school,`HS-${key}-${classCode}-${String(i).padStart(4,'0')}`,i<=2 ? 'Nguyễn Minh Anh' : `Học sinh giả ${i}`]);
          await tx.query(`INSERT INTO app.enrollments(id,school_id,student_id,class_id,year_id,starts_on,ends_on)
            VALUES($1,$2,$3,$4,$5,'2026-09-01','2027-06-01') ON CONFLICT(id) DO NOTHING`, [enrollment,school,student,classId,year]);
        }
      }
      const ruleSet = seedId(`ruleset:${key}`);
      if (!(await tx.query('SELECT id FROM app.rule_sets WHERE id=$1 AND school_id=$2',[ruleSet,school])).rowCount) {
        await tx.query(`INSERT INTO app.rule_sets(id,school_id,name,revision,base_points,minimum_points,maximum_points)
          VALUES($1,$2,'Nội quy kiểm thử',1,100,0,120)`, [ruleSet,school]);
        for (const [rule,delta,label] of [['late','-5','Đi muộn'],['bonus','2','Phát biểu tích cực']]) {
          await tx.query(`INSERT INTO app.conduct_rules(id,school_id,rule_set_id,code,label,group_name,default_delta)
            VALUES($1,$2,$3,$4,$5,'Kiểm thử',$6)`, [seedId(`rule:${key}:${rule}`),school,ruleSet,rule,label,delta]);
        }
        for (const [threshold,label] of [[90,'Tốt'],[70,'Đạt'],[0,'Cần cố gắng']] as const) await tx.query(`INSERT INTO app.rule_thresholds
          (id,school_id,rule_set_id,label,minimum_score,sort_order) VALUES($1,$2,$3,$4,$5,$6)`, [seedId(`threshold:${key}:${threshold}`),school,ruleSet,label,threshold,120-threshold]);
        await tx.query(`UPDATE app.rule_sets SET status='ISSUED',issued_at=now(),issued_by=$2 WHERE id=$1`, [ruleSet,seedId(`user:admin-${key.toLowerCase()}`)]);
        for (const code of key==='A'?['10A1','10A2']:['10A1']) await tx.query(`INSERT INTO app.class_rule_periods
          (id,school_id,class_id,rule_set_id,starts_on,ends_on) VALUES($1,$2,$3,$4,'2026-09-01','2027-06-01')`,
        [seedId(`classrules:${key}:${code}`),school,seedId(`class:${key}:${code}`),ruleSet]);
      }
      await assignment(tx,key,key==='A'?'teacher-a':'multi','10A1','HOMEROOM');
      if (key==='A') { await assignment(tx,key,'teacher-a','10A2','SUBJECT'); await assignment(tx,key,'teacher-b','10A1','SUBJECT'); }
      const student=seedId(`student:${key}:10A1:1`);
      for (let i=1;i<=3;i++) {
        const guardian=seedId(`guardian:${key}:${i}`);
        await tx.query(`INSERT INTO app.guardians(id,school_id,full_name,phone) VALUES($1,$2,$3,'0900000000') ON CONFLICT(id) DO NOTHING`,[guardian,school,`Giám hộ giả ${i}`]);
        await tx.query(`INSERT INTO app.guardian_relationships(id,school_id,student_id,guardian_id,relationship_label,can_receive_info,status,verified_by,verified_at)
          VALUES($1,$2,$3,$4,'Giám hộ',true,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,[seedId(`relationship:${key}:${i}`),school,student,guardian,
          i===3?'UNVERIFIED':'VERIFIED',i===3?null:seedId(`user:admin-${key.toLowerCase()}`),i===3?null:new Date()]);
      }
    }
    await tx.query('COMMIT');
    return { schools: 2, students: 18, emails: emails.map(name=>`${name}@example.invalid`) };
  } catch (error) { await tx.query('ROLLBACK'); throw error; }
  finally { tx.release();await pool.end(); }
}
async function assignment(tx: PoolClient,schoolKey: string,name: string,classCode: string,kind: string) {
  const school=seedId(`school:${schoolKey}`),member=seedId(`member:${schoolKey}:${name}`),cls=seedId(`class:${schoolKey}:${classCode}`);
  const grant=seedId(`grant:${schoolKey}:${name}:${classCode}:${kind}`);
  const subject=kind==='SUBJECT'?seedId(`subject:${schoolKey}:math`):null;
  await tx.query(`INSERT INTO app.role_grants(id,school_id,member_id,role_id,scope_type,class_id,subject_id,valid_from,valid_until,granted_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,'2026-09-01','2027-06-01',$8) ON CONFLICT(id) DO NOTHING`,[grant,school,member,
      seedId(`role:${schoolKey}:${kind==='HOMEROOM'?'HOMEROOM':'SUBJECT_TEACHER'}`),kind==='HOMEROOM'?'CLASS':'SUBJECT',cls,subject,
      seedId(`user:admin-${schoolKey.toLowerCase()}`)]);
  await tx.query(`INSERT INTO app.teaching_assignments(id,school_id,class_id,member_id,role_grant_id,subject_id,kind,starts_on,ends_on)
    VALUES($1,$2,$3,$4,$5,$6,$7,'2026-09-01','2027-06-01') ON CONFLICT(id) DO NOTHING`, [seedId(`assignment:${schoolKey}:${name}:${classCode}:${kind}`),school,cls,member,grant,subject,kind]);
}
