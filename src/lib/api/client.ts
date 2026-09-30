import {apiOperations,type OperationId,type ApiData,type ApiRequest} from './generated';
import {RepoError,type RepoErrorCode} from '../repositories/errors';

export interface ApiPage {limit:number;nextCursor:string|null;hasMore:boolean;total?:number}
export interface ApiEnvelope<T> {data:T;requestId:string;page?:ApiPage}
export interface ApiOptions<K extends OperationId> {
  params?:Record<string,string>;query?:Record<string,string|number|boolean|null|undefined>;
  body?:ApiRequest<K>;multipart?:FormData;idempotencyKey?:string;signal?:AbortSignal;
  parentViewId?:string;parentCsrf?:string;supportAccessId?:string;
}
interface HttpProblem {code?:string;status?:number;currentVersion?:number;requestId?:string;fieldErrors?:{path:string;message:string}[]}
let staffCsrf:string|null=null,bootstrapCsrf:string|null=null,bootstrapPending:Promise<string>|null=null;
let authEpoch=0;
const authListeners=new Set<()=>void>();
const retries=new Map<string,{key:string;at:number}>();
const blobs=new WeakMap<Blob,string>();

/** Session/CSRF values are memory-only. Authentication itself is an HttpOnly cookie. */
export function setStaffCsrf(value:string|null){staffCsrf=value;}
export function authenticationChanged(){authEpoch++;staffCsrf=null;bootstrapCsrf=null;retries.clear();authListeners.forEach(fn=>fn());}
export function onAuthenticationChanged(fn:()=>void){authListeners.add(fn);return()=>{authListeners.delete(fn);};}
function canonical(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
}
async function fingerprint(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function retryKey(hash:string,explicit?:string){
  if(explicit)return explicit;
  for(const [id,r]of retries)if(Date.now()-r.at>24*3600_000)retries.delete(id);
  const old=retries.get(hash);if(old)return old.key;
  if(retries.size>=256)retries.delete(retries.keys().next().value!);
  const key=crypto.randomUUID();retries.set(hash,{key,at:Date.now()});return key;
}
function formIdentity(form:FormData){return [...form.entries()].map(([key,v])=>{
  if(typeof v==='string')return [key,v];let id=blobs.get(v);if(!id){id=crypto.randomUUID();blobs.set(v,id);}return [key,{id,size:v.size,type:v.type,name:v.name}];
});}
function error(status:number,p:HttpProblem,auth:string,read:boolean,retryAfter:string|null,id:OperationId){
  let code:RepoErrorCode=status===401?(auth==='parent'?'REVOKED':'NO_SESSION'):status===403?'FORBIDDEN':status===404?'NOT_FOUND':status===409?'CONFLICT':status===410?'EXPIRED':status===422||status===400?'VALIDATION':read?'READ_ERROR':'NETWORK';
  if(p.code==='SCHOOL_SUSPENDED')code='SUSPENDED';
  if(p.code==='PERIOD_LOCKED'||p.code==='RULE_SET_IMMUTABLE')code='LOCKED';
  if(p.code==='DUPLICATE_SOURCE')code='DUPLICATE';
  if(p.code==='INVALID_CREDENTIALS')code='VALIDATION';
  const messages:Partial<Record<RepoErrorCode,string>>={NO_SESSION:'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.',REVOKED:'Link tra cứu không còn hiệu lực hoặc đã bị thu hồi.',NETWORK:'Không nhận được xác nhận lưu từ máy chủ. Nội dung của bạn vẫn còn; hãy thử lại.',READ_ERROR:'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.'};
  const fieldErrors=p.fieldErrors?Object.fromEntries(p.fieldErrors.map(e=>[e.path.replace(/^\//,'').replace(/\//g,'.')||'form',e.message])):undefined;
  return new RepoError(code,p.code==='INVALID_CREDENTIALS'?(id==='changePassword'?'Mật khẩu hiện tại không đúng.':'Email hoặc mật khẩu không đúng.'):status===429?'Bạn đang thao tác quá nhanh. Hãy đợi rồi thử lại.':status===503?'Máy chủ chưa sẵn sàng. Nội dung chưa lưu vẫn được giữ để thử lại.':messages[code],{fieldErrors,details:{httpStatus:status,problemCode:p.code,requestId:p.requestId,currentVersion:p.currentVersion,...(retryAfter?{retryAfter}: {})}});
}
async function csrfBootstrap(){
  if(bootstrapCsrf)return bootstrapCsrf;
  if(!bootstrapPending)bootstrapPending=(async()=>{
    const response=await http('getCsrf',{});const token=response.data.csrfToken;if(typeof token!=='string')throw new RepoError('READ_ERROR','Phản hồi bảo vệ phiên không hợp lệ.');bootstrapCsrf=token;return token;
  })().finally(()=>{bootstrapPending=null;});return bootstrapPending;
}
async function sessionCsrf(){
  if(staffCsrf)return staffCsrf;
  const context=await http('getMyContext',{});const token=context.data.csrfToken;if(typeof token!=='string')throw new RepoError('NO_SESSION');staffCsrf=token;return token;
}
function urlFor<K extends OperationId>(id:K,options:ApiOptions<K>){
  const operation=apiOperations[id];const path=operation.path.replace(/\{([^}]+)\}/g,(_match,key:string)=>{
    const value=options.params?.[key];if(!value)throw new RepoError('VALIDATION','Thiếu tham chiếu cho yêu cầu dữ liệu.',{fieldErrors:{[key]:'Vui lòng chọn đối tượng.'}});return encodeURIComponent(value);
  });
  const query=new URLSearchParams();for(const [key,value]of Object.entries(options.query??{}))if(value!==undefined&&value!==null&&value!=='')query.set(key,String(value));
  return path+(query.size?'?'+query.toString():'');
}
async function send<K extends OperationId>(id:K,options:ApiOptions<K>):Promise<{response:Response;hash?:string;epoch:number}>{
  const op=apiOperations[id],read=op.method==='GET',headers:Record<string,string>={Accept:'application/json'},epoch=authEpoch;
  const url=urlFor(id,options);
  if(options.body!==undefined&&options.multipart)throw new RepoError('VALIDATION','Yêu cầu chứa hai kiểu nội dung.');
  let body:BodyInit|undefined,hash:string|undefined;
  if(options.multipart)body=options.multipart;else if(options.body!==undefined){body=JSON.stringify(options.body);headers['Content-Type']='application/json';}
  if(options.parentViewId)headers['X-Parent-View']=options.parentViewId;
  if(options.supportAccessId)headers['X-Support-Access']=options.supportAccessId;
  if(!read){
    headers['X-CSRF-Token']=op.auth==='staff'?await sessionCsrf():op.auth==='parent'?options.parentCsrf??'':await csrfBootstrap();
    if(!headers['X-CSRF-Token'])throw new RepoError('REVOKED','Phiên tra cứu chưa được mở.');
    hash=await fingerprint({id,params:options.params,query:options.query,body:options.multipart?formIdentity(options.multipart):options.body});headers['Idempotency-Key']=retryKey(hash,options.idempotencyKey);
  }
  if(op.auth==='staff'&&epoch!==authEpoch)throw new RepoError('NO_SESSION','Phiên đã thay đổi trước khi gửi yêu cầu. Vui lòng tải lại.');
  let response:Response;
  try{response=await fetch(url,{method:op.method,headers,body,credentials:'include',cache:'no-store',redirect:'error',signal:options.signal??AbortSignal.timeout(options.multipart?120_000:30_000)});}
  catch{throw new RepoError(read?'READ_ERROR':'NETWORK',read?'Không kết nối được máy chủ để đọc dữ liệu. Hãy thử lại.':'Không nhận được xác nhận lưu. Giữ nguyên nội dung và thử lại với cùng lệnh.');}
  if(!response.ok){
    let problem:HttpProblem={};try{problem=await response.json() as HttpProblem;}catch{/* Unparseable errors are still errors; no data fallback. */}
    if(response.status<500&&response.status!==429&&hash)retries.delete(hash);
    if(problem.code==='CSRF_INVALID'){bootstrapCsrf=null;staffCsrf=null;}
    if(response.status===401&&op.auth==='staff'&&problem.code!=='INVALID_CREDENTIALS')authenticationChanged();
    throw error(response.status,problem,op.auth,read,response.headers.get('retry-after'),id);
  }
  if(op.auth==='staff'&&epoch!==authEpoch)throw new RepoError('NO_SESSION','Phiên đã thay đổi trong lúc tải dữ liệu. Vui lòng tải lại.');
  return {response,hash,epoch};
}
export async function http<K extends OperationId>(id:K,options:ApiOptions<K>={}):Promise<ApiEnvelope<ApiData<K>>>{
  const {response,hash,epoch}=await send(id,options);let result:ApiEnvelope<ApiData<K>>;
  try{result=await response.json() as ApiEnvelope<ApiData<K>>;}catch{throw new RepoError(apiOperations[id].method==='GET'?'READ_ERROR':'NETWORK','Không xác minh được phản hồi máy chủ. Hãy giữ nội dung và thử lại.');}
  if(!result||typeof result!=='object'||!Object.hasOwn(result,'data')||typeof result.requestId!=='string')throw new RepoError(apiOperations[id].method==='GET'?'READ_ERROR':'NETWORK','Phản hồi API không đúng hợp đồng.');
  if(apiOperations[id].auth==='staff'&&epoch!==authEpoch)throw new RepoError('NO_SESSION','Phiên đã thay đổi trong lúc đọc phản hồi.');
  if(hash)retries.delete(hash);return result;
}
export async function download<K extends OperationId>(id:K,options:ApiOptions<K>={}):Promise<{blob:Blob;filename:string}>{
  const {response,hash,epoch}=await send(id,options),disposition=response.headers.get('content-disposition')??'';let filename='download';
  const encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition);if(encoded)try{filename=decodeURIComponent(encoded[1]).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_');}catch{/* Safe filename remains. */}
  let blob:Blob;try{blob=await response.blob();}catch{throw new RepoError(apiOperations[id].method==='GET'?'READ_ERROR':'NETWORK','Tệp chưa được tải đầy đủ. Vui lòng thử lại.');}
  if(apiOperations[id].auth==='staff'&&epoch!==authEpoch)throw new RepoError('NO_SESSION','Phiên đã thay đổi trong lúc tải tệp.');
  if(hash)retries.delete(hash);return {blob,filename};
}
