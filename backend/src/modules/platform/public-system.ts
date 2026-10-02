import {one,type Database,type Row} from '../../database/database';
import {notFound,Problem} from '../../common/problem';
import type {Handler} from '../../api.router';

const unavailable=()=>new Problem(503,'PUBLIC_CONFIGURATION_UNAVAILABLE');
function publicText(value:unknown,max:number,required=false):string|null{
 if(value===null||value===undefined){if(required)throw unavailable();return null;}
 if(typeof value!=='string'||value.length>max||required&&!value.trim())throw unavailable();return value;
}
/** Explicit projection: operational settings, school IDs and suspension notes remain private. */
export function publicPlatformContact(row:Row|undefined){
 if(!row||!row.value||typeof row.value!=='object'||Array.isArray(row.value))throw unavailable();const v=row.value as Row;
 return {brandName:publicText(v.brandName,160,true)!,supportEmail:publicText(v.supportEmail,320),supportPhone:publicText(v.publicSupportPhone,120),footerNote:publicText(v.footerNote,1000)??''};
}
export function publicSchoolStatus(row:Row|undefined){
 if(!row||!['ACTIVE','SUSPENDED','ARCHIVED'].includes(String(row.status)))notFound();
 return {name:publicText(row.name,300,true)!,slug:publicText(row.slug,40,true)!,status:String(row.status),publicEmail:publicText(row.public_contact_email,320),publicPhone:publicText(row.public_contact_phone,120)};
}
export function publicSystemHandlers(db:Database):Record<string,Handler>{return {
 getPublicPlatformContact:async c=>{if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');return db.transaction(async tx=>({data:publicPlatformContact(await one<Row>(tx,"SELECT value FROM platform.settings WHERE key='business_ui'"))}),{readOnly:true});},
 getPublicSchoolStatus:async c=>{if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.params.schoolSlug??'')||(c.params.schoolSlug?.length??0)>40)notFound();return db.transaction(async tx=>({data:publicSchoolStatus(await one<Row>(tx,"SELECT name,slug,status,public_contact_email,public_contact_phone FROM platform.schools WHERE slug=$1 AND status<>'DRAFT'",[c.params.schoolSlug]))}),{readOnly:true});},
};}
