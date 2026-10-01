import type {ApiSchemas} from '../../api/generated';
import type {Gender,ParentModule} from '../../model/types';
import {dateDays} from '../../api/dates';
import {RepoError} from '../errors';

const sections=['overview','teachers','attendance','conduct','timetable','duties','activities','announcements','documents'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(){return new RepoError('READ_ERROR','API chưa xác nhận đầy đủ phạm vi phiên tra cứu.');}
function text(value:unknown){if(typeof value!=='string'||!value)throw invalid();return value;}
function nullable(value:unknown){return value===null?null:text(value);}
function date(value:unknown){const result=text(value);try{dateDays(result,0);}catch{throw invalid();}return result;}
function timestamp(value:unknown){const result=text(value);if(!Number.isFinite(Date.parse(result)))throw invalid();return result;}
/** Wire CSRF/view fields belong only to the session owner; display never returns credentials. */
export function nativeParentContext(value:ApiSchemas['ParentContext'],slug:string,preview=false){
  for(const object of [value,value.school,value.student,value.year]){
    if(!object||['token','tokenHash','cookie','dateOfBirth','internalNote','phone','email','studentId','guardianId','guardians','students'].some(key=>Object.hasOwn(object,key)))throw invalid();
  }
  if(!uuid.test(text(value.viewId))||value.school.slug!==slug||!Array.isArray(value.allowedSections)||!value.allowedSections.length||new Set(value.allowedSections).size!==value.allowedSections.length||value.allowedSections.some(section=>!sections.includes(section))||typeof value.allowDownload!=='boolean'||value.allowDownload&&!value.allowedSections.includes('documents'))throw invalid();
  const startsOn=date(value.year!.startsOn),endsOn=date(value.year!.endsOn),today=date(value.today),linkExpiresAt=timestamp(value.linkExpiresAt),sessionExpiresAt=timestamp(value.expiresAt),yearLabel=text(value.year!.label);
  if(startsOn>=endsOn||yearLabel!==value.student.schoolYearLabel||Date.parse(sessionExpiresAt)>Date.parse(linkExpiresAt))throw invalid();
  const lastPublishedAt=value.lastPublishedAt===null?null:timestamp(value.lastPublishedAt);
  const display={student:{fullName:text(value.student.displayName),gender:null as Gender|null,avatarTone:'blue'},
    className:text(value.student.classLabel),school:{name:text(value.school.name),shortName:nullable(value.school.shortName),slug,publicPhone:nullable(value.school.publicContactPhone),publicEmail:nullable(value.school.publicContactEmail),address:nullable(value.school.publicAddress),motto:nullable(value.school.motto)},
    yearLabel,year:{label:yearLabel,startsOn,endsOn},today,modules:value.allowedSections.filter(section=>section!=='overview') as ParentModule[],overviewAllowed:value.allowedSections.includes('overview'),allowDownload:value.allowDownload,
    expiresAt:linkExpiresAt,sessionExpiresAt,lastPublishedAt,relation:text(value.relationshipLabel),isPreview:preview};
  return {viewId:text(value.viewId),csrfToken:text(value.csrfToken),display};
}
