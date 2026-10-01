import type {ApiSchemas} from '../../api/generated';
import type {AttendanceStatus} from '../../model/types';
import {http} from '../../api/client';
import {RepoError} from '../errors';
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ chuyên cần của học sinh trong lớp.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const count=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0;
function exact(v:object,keys:string[]){if(!v||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw invalid();}
export function nativeClassStudentAttendance(v:ApiSchemas['ClassStudentAttendance'],schoolId:string,yearId:string,classId:string,studentId:string){
 exact(v,['schoolId','yearId','classId','studentId','today','referenceDate','className','sessions','published','tally','notable']);
 if(![schoolId,yearId,classId,studentId].every(uuid)||v.schoolId!==schoolId||v.yearId!==yearId||v.classId!==classId||v.studentId!==studentId||!date(v.today)||!date(v.referenceDate)||typeof v.className!=='string'||!v.className.trim()||!count(v.sessions)||v.sessions>5000||!count(v.published)||v.published>v.sessions||!Array.isArray(v.notable)||v.notable.length>Math.min(8,v.sessions))throw invalid();
 exact(v.tally,['PRESENT','LATE','EXCUSED','UNEXCUSED','UNMARKED']);if(Object.values(v.tally).some(n=>!count(n))||Object.values(v.tally).reduce((a,b)=>a+b,0)!==v.sessions)throw invalid();
 const tally:Record<AttendanceStatus,number>={present:v.tally.PRESENT,late:v.tally.LATE,excused:v.tally.EXCUSED,unexcused:v.tally.UNEXCUSED,unmarked:v.tally.UNMARKED};
 const notable=v.notable.map(n=>{exact(n,['date','status','note','published']);if(!date(n.date)||n.date>v.referenceDate||!['LATE','EXCUSED','UNEXCUSED','UNMARKED'].includes(n.status)||typeof n.published!=='boolean'||!(n.note===null||typeof n.note==='string'&&n.note.length<=4000))throw invalid();return {...n,status:n.status.toLowerCase() as AttendanceStatus,note:n.note??undefined};});
 if(new Set(notable.map(n=>n.date)).size!==notable.length||notable.some((n,i)=>i>0&&n.date>notable[i-1].date)||notable.filter(n=>n.published).length>v.published||notable.some(n=>tally[n.status]<notable.filter(x=>x.status===n.status).length))throw invalid();return {...v,tally,notable};
}
export async function readClassStudentAttendance(schoolId:string,yearId:string,classId:string,studentId:string){return nativeClassStudentAttendance((await http('getClassStudentAttendance',{params:{schoolId,yearId,classId,studentId}})).data,schoolId,yearId,classId,studentId);}
