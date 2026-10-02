import {http} from '../../api/client';
import {RepoError} from '../errors';

const invalid=()=>new RepoError('READ_ERROR','Máy chủ chưa xác nhận đầy đủ thông tin công khai.');
function exact(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw invalid();return value as Record<string,unknown>;}
function text(value:unknown,max:number,required=false):string{if(typeof value!=='string'||value.length>max||required&&!value.trim())throw invalid();return value;}
function contact(value:unknown,max:number){return value===null?'':text(value,max);}
export function nativePublicContact(value:unknown){const v=exact(value,['brandName','supportEmail','supportPhone','footerNote']);return {brandName:text(v.brandName,160,true),supportEmail:contact(v.supportEmail,320),supportPhone:contact(v.supportPhone,120),footerNote:text(v.footerNote,1000)};}
export function nativePublicSchoolStatus(value:unknown,slug:string){const v=exact(value,['name','slug','status','publicEmail','publicPhone']);if(v.slug!==slug||!['ACTIVE','SUSPENDED','ARCHIVED'].includes(String(v.status)))throw invalid();return {name:text(v.name,300,true),slug:text(v.slug,40,true),status:String(v.status).toLowerCase() as 'active'|'suspended'|'archived',publicEmail:contact(v.publicEmail,320),publicPhone:contact(v.publicPhone,120)};}
export const connectedPublicSystemRepo={
 async publicContact(){return nativePublicContact((await http('getPublicPlatformContact',{validateData:value=>{nativePublicContact(value);return true;}})).data);},
 async schoolStatusBySlug(slug:string){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>40)throw new RepoError('NOT_FOUND','Không tìm thấy trường.');return nativePublicSchoolStatus((await http('getPublicSchoolStatus',{params:{schoolSlug:slug},validateData:value=>{nativePublicSchoolStatus(value,slug);return true;}})).data,slug);},
};
