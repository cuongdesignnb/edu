import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {RepoError} from '../errors';
import type {PublicFileSource} from '@/components/ui/file';

type School=ApiSchemas['PublicSchoolCard'];
type News=ApiSchemas['PublicNewsSummary'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ nội dung công khai.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown,max=500)=>typeof v==='string'&&v.length<=max;
const nullable=(v:unknown,max=500)=>v===null||text(v,max);
const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const stamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
function exact(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw invalid();}
export function publicSchoolCard(v:School,slug:string){
 exact(v,['name','shortName','slug','address','publicPhone','publicEmail','website','motto','publicIntro','accentColor','status','level']);
 if(v.slug!==slug||!text(v.name)||!v.name.trim()||![v.shortName,v.address,v.publicPhone,v.publicEmail,v.level].every(x=>nullable(x))||!nullable(v.website,2048)||!text(v.motto,300)||!text(v.publicIntro,4000)||!/^#[0-9a-fA-F]{6}$/.test(v.accentColor)||!['active','suspended','archived'].includes(v.status))throw invalid();
 return v;
}
function summary(v:News){exact(v,['id','title','summary','publishedAt']);if(!uuid(v.id)||!text(v.title)||!v.title.trim()||!text(v.summary,2000)||!stamp(v.publishedAt))throw invalid();return v;}
export function publicNewsWorkspace(v:ApiSchemas['PublicNewsWorkspace'],slug:string,id:string){
 exact(v,['school','news']);exact(v.school,['name','slug']);if(v.school.slug!==slug||!text(v.school.name)||!v.school.name.trim())throw invalid();
 const n=v.news;exact(n,['id','title','summary','publishedAt','body','source','attachments']);summary({id:n.id,title:n.title,summary:n.summary,publishedAt:n.publishedAt});exact(n.source,['rootId','publicationId']);
 if(n.id!==id||n.source.rootId!==id||!uuid(n.source.publicationId)||!Array.isArray(n.body)||!n.body.length||n.body.length>500||!Array.isArray(n.attachments)||n.attachments.length>100)throw invalid();
 for(const b of n.body){exact(b,['type','text']);if(!['p','h','li'].includes(b.type)||!text(b.text,50000)||!b.text.trim())throw invalid();}
 for(const f of n.attachments){exact(f,['id','name','mime','size']);if(!uuid(f.id)||!text(f.name)||!f.name.trim()||!text(f.mime)||!f.mime.trim()||!count(f.size))throw invalid();}
 if(new Set(n.attachments.map(f=>f.id)).size!==n.attachments.length)throw invalid();
 return {...v,news:{...n,attachments:n.attachments.map(f=>({...f,source:{kind:'public_api',schoolSlug:slug,announcementId:id,publicationId:n.source.publicationId,fileId:f.id} as PublicFileSource}))}};
}
/** Public methods do not borrow staff membership or create parent accounts. */
export const connectedPublicAnnouncementsRepo={
 async publicSchool(slug:string){
  let school:School|undefined,cursor:string|undefined;const news:News[]=[],seen=new Set<string>(),cursors=new Set<string>();
  for(let pageNumber=0;pageNumber<100;pageNumber++){
   const r=await http('getPublicSchoolWorkspace',{params:{schoolSlug:slug},query:{limit:100,cursor}}),v=r.data,p=r.page;
   exact(v,['school','news']);publicSchoolCard(v.school,slug);exact(p,['limit','hasMore','nextCursor','total']);
   if(!p||p.limit!==100||typeof p.hasMore!=='boolean'||!count(p.total)||!(p.nextCursor===null||text(p.nextCursor,4096)&&!!p.nextCursor)||p.hasMore!==(p.nextCursor!==null)||!Array.isArray(v.news)||v.news.length>p.limit||v.school.status!=='active'&&v.news.length)throw invalid();
   if(school&&Object.keys(school).some(k=>school![k as keyof School]!==v.school[k as keyof School]))throw invalid();school=v.school;
   for(const item of v.news){summary(item);if(seen.has(item.id)||seen.size>=10000)throw invalid();seen.add(item.id);news.push(item);}
   if(!p.hasMore)return {school:{...school,shortName:school.shortName??undefined,website:school.website??undefined},news};
   if(!v.news.length||!p.nextCursor||cursors.has(p.nextCursor))throw invalid();cursors.add(p.nextCursor);cursor=p.nextCursor;
  }
  throw invalid();
 },
 async publicNews(slug:string,id:string){return publicNewsWorkspace((await http('getPublicNewsWorkspace',{params:{schoolSlug:slug,announcementId:id}})).data,slug,id);},
};
